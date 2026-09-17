import { createClient } from '@supabase/supabase-js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { date, start, end } = req.query
  let page = parseInt(req.query.page, 10)
  let pageSize = parseInt(req.query.pageSize, 10)
  if (!Number.isFinite(page) || page < 1) page = 1
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE)

  let rangeStartIso = null
  let rangeEndIso = null // exclusive

  if (start || end) {
    if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
      res.status(400).json({ error: 'start and end must both be provided as YYYY-MM-DD' })
      return
    }
    rangeStartIso = `${start}T00:00:00.000Z`
    rangeEndIso = addDays(end, 1)
  } else if (date) {
    if (!DATE_RE.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' })
      return
    }
    rangeStartIso = `${date}T00:00:00.000Z`
    rangeEndIso = addDays(date, 1)
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    let query = supabase
      .from('checks')
      .select('service_id, service_name, checked_at, status_code, is_valid_check, latency_ms, agent, region', {
        count: 'exact',
      })
      .order('checked_at', { ascending: false })

    if (rangeStartIso) query = query.gte('checked_at', rangeStartIso)
    if (rangeEndIso) query = query.lt('checked_at', rangeEndIso)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await query.range(from, to)
    if (error) throw new Error(error.message)

    res.status(200).json({ rows: data, total: count, page, pageSize })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
