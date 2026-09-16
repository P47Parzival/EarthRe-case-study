import { processUpload } from '../lib/processUpload.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const csvText = typeof req.body === 'string' ? req.body : req.body?.csv
  if (!csvText || typeof csvText !== 'string') {
    res.status(400).json({ error: 'Missing CSV text body' })
    return
  }

  try {
    const summary = await processUpload(csvText)
    res.status(200).json({ summary })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
