import { createClient } from '@supabase/supabase-js'
import { computeStats } from '../lib/computeStats.js'

const PAGE_SIZE = 1000

async function fetchAllChecks(supabase) {
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from('checks')
      .select('service_id, service_name, checked_at, status_code, is_valid_check, latency_ms, agent')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const rows = await fetchAllChecks(supabase)
    const stats = computeStats(rows)
    res.status(200).json(stats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
