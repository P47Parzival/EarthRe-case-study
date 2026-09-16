import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import { cleanRows } from './cleanRows.js'

const BATCH_SIZE = 1000

export async function processUpload(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true })
  const { cleanedRows, summary } = cleanRows(rows)

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  for (let i = 0; i < cleanedRows.length; i += BATCH_SIZE) {
    const batch = cleanedRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('checks')
      .upsert(batch, { onConflict: 'service_id,checked_at,agent', ignoreDuplicates: true })
    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`)
    }
  }

  return summary
}
