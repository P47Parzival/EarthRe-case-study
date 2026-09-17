# SLA Monitoring Dashboard

## Architecture

```
Upload UI (React)  ──POST /api/upload──▶  Vercel serverless function
     │                                           │
     │                                    parse → clean → batch-upsert
     │                                           │     
     │                                           ▼
     │                                    Supabase Postgres (`checks` table)
     │                                           ▲
     │               ──GET /api/stats────────────┤
Dashboard UI (React)                             │ 
                     ──GET /api/logs─────────────┘
```

- **Frontend — React + Vite + Tailwind, in `frontend/`.** A single SPA with two tabs (Upload, Dashboard) instead of a router — there are only ever two screens and no deep-linking requirement, so `react-router` would be an unused dependency for what a couple of `useState` booleans already solve simply.
- **Stateless processing — Vercel serverless functions, in `/api` at the repo root.** `api/upload.js` accepts the raw CSV as a `text/plain` body, delegates to `lib/processUpload.js` (parse → `lib/cleanRows.js` → batch-upsert), and returns a cleaning summary. `api/stats.js` and `api/logs.js` are separate read-only endpoints over the same persisted table. Chosen over a second cloud provider (AWS Lambda/GCP Cloud Function) specifically because it satisfies "a real, deployed, stateless serverless function" while keeping one platform, one deploy, one set of credentials for a weekend build.
- **Persistence — Supabase (hosted Postgres), free tier.** One table (`checks`, `supabase/schema.sql`) with a unique constraint on `(service_id, checked_at, agent)` doing double duty as both the dedup rule and the idempotency guarantee for repeat uploads. Chosen over DynamoDB/Firestore because SQL aggregation (percentiles, group-by-hour, etc.) is exactly what the stats layer needs, and it's queryable directly from the dashboard via `@supabase/supabase-js` with no ORM.
- **Deploy — Vercel, single project.** `vercel.json` at the repo root builds `frontend/` (`cd frontend && npm install && npm run build` → `frontend/dist`) while `/api` is auto-detected as serverless functions at the true repo root — one project, one live URL, not two separate deployments for frontend and backend.
- **Pure-function core.** `lib/cleanRows.js`, `lib/computeStats.js`, and `lib/processUpload.js` are framework-agnostic — they take plain data in and return plain data out, so they were unit-tested with throwaway Node scripts (`scripts/*.js`) against the real CSVs before ever being wired into an HTTP handler. This is why the core logic could be verified locally before any deploy.

## Data findings

Found by direct inspection of the primary CSV (`monitoring_checks_9d_seed101.csv`) and confirmed generic (not hardcoded) by spot-checking `monitoring_checks_12d_seed505.csv` — both processed by `lib/cleanRows.js`:

1. **Mixed timestamp formats**: three formats coexist in the same column: UTC ISO (`...Z`), offset ISO (`...+05:30`), and bare Unix epoch seconds (e.g. `1746938700`). Detected via regex for the epoch case and `Date` parsing otherwise; all normalized to UTC ISO. On the 9d file: 4570 UTC / 32 offset / 70 epoch rows.
2. **Sentinel status code `999`**: not a real HTTP status. Any status outside the standard 100–599 range, or exactly `999`, is flagged `is_valid_check: false` but the row is kept (not deleted) so it's still visible in the logs view; it's excluded from latency/uptime math at the stats layer.
3. **Null latency (~1%)**: left as `null`, counted in the summary (`latency_nulls`). Not imputed.
4. **Mixed `latency_unit` (`ms`/`s`)**: normalized to ms before persisting. Unrecognized units are assumed ms but flagged (`unknown_latency_units`) for visibility — none appeared in either file tested.
5. **Negative latency**: physically invalid, so the value is nulled out (excluded from stats) rather than clipped to 0, and counted separately (`negative_latencies_excluded`) so the exclusion is visible, not silent. Exactly 1 found per file tested.
6. **Duplicate rows**: deduped on `(service_id, checked_at, agent)`: first occurrence kept, later ones dropped. This key covers both exact full-row duplicates and re-transmitted checks with matching values. A `conflicting_duplicates` counter also tracks same-key rows with *differing* status/latency (none seen in either file) so a genuine data conflict wouldn't be silently swallowed by the same rule.
7. **Agent cadence asymmetry** (`agent-1` every ~15 min, `agent-2` sparse/irregular): not handled in the cleaning step itself; both agents' cleaned rows are persisted as-is. The uptime/count formula that has to account for this asymmetry is a stats-layer decision, made explicitly before the stats query was written.

## Assumptions

- **Dedup key**: `(service_id, checked_at, agent)`: chosen because the spec ties duplicates to "identical" or "matching" rows sharing exactly this triple; first-seen row wins on a collision.
- **Invalid status handling**: any status outside 100–599, or exactly `999`, is treated as a failed/invalid check, flagged, not deleted, so support/on-call can still see the row in the logs.
- **Negative latency**: nulled and excluded from stats rather than clipped to 0, since clipping would fabricate a plausible-looking but false latency value.
- **Upload body format**: the frontend sends the raw CSV as a `text/plain` request body rather than `multipart/form-data`, Vercel's Node functions auto-parse `text/plain` into a plain string (`req.body`), avoiding the need for a multipart-parsing dependency for a single-file upload.
- **Repeat/duplicate uploads across files**: `/api/upload` uses `upsert(..., { onConflict: 'service_id,checked_at,agent', ignoreDuplicates: true })` instead of a plain insert. This makes re-uploading the same file (or an overlapping file) idempotent, matching rows are silently skipped instead of throwing a unique-constraint error that would fail the whole batch. Verified by running the same 9-day file through the pipeline twice: row count stayed at 4665 both times.

### Stats design

- **Uptime / availability % (per service and overall)**: numerator = checks with `status_code` 200–399; denominator = all checks where `is_valid_check = true` (i.e. `999`/non-standard-status rows are excluded from the calculation entirely, not just excluded from the numerator). The `999`/agent-error count is still surfaced as its own explicit stat, overall and per service, so it's never silently hidden even though it doesn't move the uptime number.
- **Agent-cadence asymmetry**: rather than hardcoding `agent-1` as "the reliable agent" (the primary CSV's literal values aren't allowed to leak into app logic), the **primary agent is chosen per service from the data itself** whichever agent reported the most checks for that service in the observed period. Uptime/count/downtime math for a service uses only that agent's rows. All agents' rows are still persisted and shown in the logs view; the primary-agent rule only affects the aggregate calculation.
- **No monthly-99.9%-style framing**: we only ever have a handful of days, never a real month, so the dashboard presents **"availability over the observed period"** with the actual date range and day-count computed dynamically from `min(checked_at)`/`max(checked_at)` — never hardcoded. The classic 99.9% number still appears, but as a labeled benchmark line/badge, not a compliance claim over a period we don't actually have.
- **SLA-breach badge per service**: a simple 🟢 Met / 🔴 Breached badge comparing that service's uptime % against the 99.9% benchmark — this is the actual question a billing team would be looking at the dashboard to answer, so it's answered directly rather than left as a mental comparison for the viewer.
- **Downtime duration per service**: `(valid_checks - successful_checks) × median_interval_for_that_service's_primary_agent`, shown as "Xh Ym" — makes an abstract percentage concrete ("2h 15m of downtime over 9 days"). The interval is computed from the actual median gap between the primary agent's consecutive checks rather than hardcoding the 15-minute cadence mentioned in the problem statement, so it still works correctly on a CSV with a different cadence.
- **Latency stat**: p95 and average latency per service, computed only over rows with `is_valid_check = true` and non-null `latency_ms` (so sentinel/invalid checks and already-nulled bad latency values never pollute it).
- **Worst-hour card** (surfacing the incident window without hardcoding it): checks are grouped by `(service, hour)`; the "error rate" for this specific diagnostic, unlike the SLA uptime % above — intentionally counts *both* real error statuses (4xx/5xx) *and* agent-errors (`999`) as bad events, since an incident that also breaks the monitoring agent should still show up as a bad hour. The single worst bucket system-wide (service, hour, error rate, failed/total) is surfaced directly. This is a deliberate, called-out exception to the SLA-math exclusion rule above the uptime % and the worst-hour diagnostic are answering different questions (formal availability vs. "where do I look first").

## Live URL + how to run/redeploy

**Live URL:** https://earth-re-case-study.vercel.app/

Deployed on Vercel (frontend + `/api` serverless functions in one project) with persistence on Supabase (free tier). Verified live by uploading a real CSV directly against the deployed `/api/upload` endpoint and confirming the row count increase in Supabase matched the returned summary exactly a genuinely cloud-executed run, not a local one.

### Environment variables (set in Vercel Project Settings → Environment Variables)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — mark as "Sensitive" in Vercel's env var settings (server-side only, never exposed to the browser)

### Run locally
```
cd frontend && npm install && npm run dev   # frontend on localhost:5173
npm install                                  # at repo root, for /api function deps
```
Create a `.env.local` at the repo root with the two variables above to run any of the `scripts/*.js` local test scripts against your own Supabase project.

### Redeploy
Push to the connected GitHub repo's `main` branch — Vercel auto-deploys. `vercel.json` at the repo root builds `frontend/` (`cd frontend && npm install && npm run build`, output `frontend/dist`) while `/api` at the true repo root is picked up automatically as serverless functions.

**Gotcha hit during deploy:** an explicit `export const config = { maxDuration: 60 }` in `api/upload.js` silently caused that one function to fail to deploy (404 in production, no error in build logs) because 60s exceeds the Hobby plan's function-duration limit. Removed it and the default (10s) is well within what the actual processing takes.

## What you'd do differently

- **Push aggregation into SQL.** `api/stats.js` currently paginates the entire `checks` table into the function and computes uptime/percentiles/worst-hour in JS. That's fine at tens of thousands of rows, but a Postgres view or RPC function using `percentile_cont` and window functions would scale to millions of rows without ever pulling full row data out of the database.
- **Streaming/chunked upload for large files.** The current `/api/upload` reads the whole CSV into memory as one `text/plain` body — fine for the files here (≤1.2MB) but would hit Vercel's request body limit on a much larger file. A real product would stream/chunk the upload.
- **A visible admin/reset action.** Clearing test data currently requires running a throwaway script directly against Supabase (and even then, bulk deletes get blocked by this environment's own safety guardrails, which is the right default — but there's no in-product way to do it deliberately either). A small "reset demo data" action, gated appropriately, would make re-demoing cleaner.
- **A real time-series view**, not just the single worst-hour card, an error-rate-over-time chart per service would make an incident's *shape* (not just its single worst hour) visible at a glance.
- **Automated tests with a real test runner** (e.g. Vitest) for `lib/cleanRows.js` and `lib/computeStats.js`, replacing the throwaway `scripts/*.js` sanity checks. CI itself is out of scope per the spec, but the tests themselves aren't, and would catch regressions the manual scripts can't.
- **A more defined conflict-resolution rule** for same-key duplicates with genuinely differing values (currently just counted via `conflicting_duplicates` and first-row-wins) e.g. "latest re-transmission wins" instead of "first seen wins," if that turns out to matter for a real monitoring feed.

## Beyond scope: features i could have added but didnt, because they were not in requirements.

These weren't built because the spec explicitly scoped them out or they weren't required, but in a production system they'd be natural next steps:

- **Direct ingestion from cloud storage (S3/GCS).** In a real environment, monitoring agents would write logs directly to a cloud bucket. The serverless function could be triggered automatically by a bucket event (e.g., S3 `PutObject` → Lambda trigger) instead of requiring a human to download a CSV and manually upload it through a browser. This would eliminate the manual step entirely and make the pipeline continuous.
- **Real-time monitoring with WebSocket/SSE.** The current flow is batch-oriented (upload a file → see results). A production SLA dashboard would subscribe to a live stream of health-check events and update stats in real time, so on-call engineers see issues as they happen, not after the fact.
- **Automated SLA credit calculation.** The dashboard currently shows whether each service breached the 99.9% threshold, but stops short of computing the actual billing credit amount. In production, this would tie into the provider's credit schedule (e.g., <99.9% = 10% credit, <99.0% = 25% credit) and generate a line item automatically.
- **Alerting and notifications.** When a service's uptime drops below the SLA threshold, the system could trigger an alert via Slack, email, or PagerDuty, so the billing or on-call team doesn't have to be staring at the dashboard to notice a breach.
- **Exportable PDF/CSV reports.** Billing teams often need to attach SLA reports to invoices or share them with customers. A one-click "Export report" that generates a formatted PDF with the stats summary and incident timeline would be a high-value addition.
- **Historical trend analysis.** Comparing SLA performance across multiple upload periods (e.g., month-over-month uptime trends) to spot services that are gradually degrading before they breach.
