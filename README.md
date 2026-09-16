# SLA Monitoring Dashboard

## Architecture

## Data findings

Found by direct inspection of the primary CSV (`monitoring_checks_9d_seed101.csv`) and confirmed generic (not hardcoded) by spot-checking `monitoring_checks_12d_seed505.csv` — both processed by `lib/cleanRows.js`:

1. **Mixed timestamp formats** — three formats coexist in the same column: UTC ISO (`...Z`), offset ISO (`...+05:30`), and bare Unix epoch seconds (e.g. `1746938700`). Detected via regex for the epoch case and `Date` parsing otherwise; all normalized to UTC ISO. On the 9d file: 4570 UTC / 32 offset / 70 epoch rows.
2. **Sentinel status code `999`** — not a real HTTP status. Any status outside the standard 100–599 range, or exactly `999`, is flagged `is_valid_check: false` but the row is kept (not deleted) so it's still visible in the logs view; it's excluded from latency/uptime math at the stats layer.
3. **Null latency (~1%)** — left as `null`, counted in the summary (`latency_nulls`). Not imputed.
4. **Mixed `latency_unit` (`ms`/`s`)** — normalized to ms before persisting. Unrecognized units are assumed ms but flagged (`unknown_latency_units`) for visibility — none appeared in either file tested.
5. **Negative latency** — physically invalid, so the value is nulled out (excluded from stats) rather than clipped to 0, and counted separately (`negative_latencies_excluded`) so the exclusion is visible, not silent. Exactly 1 found per file tested.
6. **Duplicate rows** — deduped on `(service_id, checked_at, agent)`: first occurrence kept, later ones dropped. This key covers both exact full-row duplicates and re-transmitted checks with matching values. A `conflicting_duplicates` counter also tracks same-key rows with *differing* status/latency (none seen in either file) so a genuine data conflict wouldn't be silently swallowed by the same rule.
7. **Agent cadence asymmetry** (`agent-1` every ~15 min, `agent-2` sparse/irregular) — not handled in the cleaning step itself; both agents' cleaned rows are persisted as-is. The uptime/count formula that has to account for this asymmetry is a stats-layer decision, made explicitly in Step 6 before the stats query is written.

## Assumptions

- **Dedup key**: `(service_id, checked_at, agent)` — chosen because the spec ties duplicates to "identical" or "matching" rows sharing exactly this triple; first-seen row wins on a collision.
- **Invalid status handling**: any status outside 100–599, or exactly `999`, is treated as a failed/invalid check — flagged, not deleted — so support/on-call can still see the row in the logs.
- **Negative latency**: nulled and excluded from stats rather than clipped to 0, since clipping would fabricate a plausible-looking but false latency value.
- **Upload body format**: the frontend sends the raw CSV as a `text/plain` request body rather than `multipart/form-data` — Vercel's Node functions auto-parse `text/plain` into a plain string (`req.body`), avoiding the need for a multipart-parsing dependency for a single-file upload.
- **Repeat/duplicate uploads across files**: `/api/upload` uses `upsert(..., { onConflict: 'service_id,checked_at,agent', ignoreDuplicates: true })` instead of a plain insert. This makes re-uploading the same file (or an overlapping file) idempotent — matching rows are silently skipped instead of throwing a unique-constraint error that would fail the whole batch. Verified by running the same 9-day file through the pipeline twice: row count stayed at 4665 both times.

## Live URL + how to run/redeploy

## What you'd do differently
