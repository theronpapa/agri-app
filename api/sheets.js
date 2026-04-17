const SHEET_ID = '1w9OZLWwKaZl_eOLC_7aEmrIuETRGc4zpQ8-qY0PN4yk';
const MATON_KEY = process.env.MATON_API_KEY;
const BASE = 'https://gateway.maton.ai/google-sheets/v4/spreadsheets';

async function sheetsGet(range) {
  const res = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { 'Authorization': `Bearer ${MATON_KEY}` }
  });
  return res.json();
}

async function sheetsUpdate(range, values) {
  const res = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${MATON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  return res.json();
}

async function sheetsAppend(range, values) {
  const res = await fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MATON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, tab, range, values, row } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const query = req.query;

  try {
    // GET requests
    if (req.method === 'GET') {
      const t = query.tab || 'Contacts';
      const r = query.range || `${t}!A1:Z1000`;
      const data = await sheetsGet(r);
      const rows = data.values || [];
      if (rows.length < 2) return res.json({ headers: rows[0] || [], data: [] });
      const headers = rows[0];
      const records = rows.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = r[i] || ''; });
        return obj;
      });
      return res.json({ headers, data: records, total: records.length });
    }

    // POST requests
    if (req.method === 'POST') {
      if (action === 'append') {
        const result = await sheetsAppend(`${tab}!A1`, values);
        // Log activity
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, values[0]?.[0] || 'System', 'Record Added', `Added to ${tab}`]]);
        return res.json({ ok: true, result });
      }

      if (action === 'update') {
        const result = await sheetsUpdate(range, values);
        return res.json({ ok: true, result });
      }

      if (action === 'update_contact') {
        // Find contact row by ID and update
        const all = await sheetsGet('Contacts!A:I');
        const rows = all.values || [];
        let rowIdx = -1;
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === String(row.ID)) { rowIdx = i + 1; break; }
        }
        if (rowIdx === -1) return res.json({ ok: false, error: 'Contact not found' });
        const vals = [row.ID, row.Name, row.Company, row.Email, row.Category, row.Location, row.Status, row.Notes, new Date().toISOString()];
        await sheetsUpdate(`Contacts!A${rowIdx}:I${rowIdx}`, [vals]);
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, query.user || 'Admin', 'Contact Updated', `${row.Company} -> ${row.Status}`]]);
        return res.json({ ok: true });
      }

      if (action === 'update_booth') {
        const all = await sheetsGet('Booths!A:G');
        const rows = all.values || [];
        let rowIdx = -1;
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === row['Booth ID']) { rowIdx = i + 1; break; }
        }
        if (rowIdx === -1) return res.json({ ok: false, error: 'Booth not found' });
        const vals = [row['Booth ID'], row.Size, row.Type, row.Status, row.Company, row.Price, row['Payment Status']];
        await sheetsUpdate(`Booths!A${rowIdx}:G${rowIdx}`, [vals]);
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, query.user || 'Admin', 'Booth Updated', `${row['Booth ID']}: ${row.Company || 'Cleared'}`]]);
        return res.json({ ok: true });
      }

      if (action === 'update_followup') {
        const all = await sheetsGet('Followups!A:G');
        const rows = all.values || [];
        let rowIdx = -1;
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === String(row.ID)) { rowIdx = i + 1; break; }
        }
        if (rowIdx === -1) return res.json({ ok: false, error: 'Followup not found' });
        const vals = [row.ID, row.Company, row.Task, row.Date, row.Status, row['Assigned To'], row.Created];
        await sheetsUpdate(`Followups!A${rowIdx}:G${rowIdx}`, [vals]);
        return res.json({ ok: true });
      }

      if (action === 'log') {
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, query.user || 'Admin', values[0], values[1]]]);
        return res.json({ ok: true });
      }

      if (action === 'bulk_import') {
        // Bulk import contacts - get max ID first
        const all = await sheetsGet('Contacts!A:A');
        const ids = (all.values || []).slice(1).map(r => parseInt(r[0]) || 0);
        let maxId = ids.length ? Math.max(...ids) : 0;
        const newRows = values.map(v => {
          maxId++;
          return [maxId, v[0], v[1], v[2], v[3], v[4], 'New', '', new Date().toISOString()];
        });
        await sheetsAppend('Contacts!A1', newRows);
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, query.user || 'Admin', 'CSV Import', `${newRows.length} contacts imported`]]);
        return res.json({ ok: true, imported: newRows.length });
      }

      if (action === 'delete_contact') {
        // Mark as deleted by clearing the row (Sheets API doesn't easily delete rows)
        const all = await sheetsGet('Contacts!A:I');
        const rows = all.values || [];
        let rowIdx = -1;
        let company = '';
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === String(row.ID)) { rowIdx = i + 1; company = rows[i][2]; break; }
        }
        if (rowIdx === -1) return res.json({ ok: false, error: 'Not found' });
        await sheetsUpdate(`Contacts!A${rowIdx}:I${rowIdx}`, [['', '', '', '', '', '', 'DELETED', '', '']]);
        const ts = new Date().toISOString();
        await sheetsAppend('Activity!A1', [[ts, query.user || 'Admin', 'Contact Deleted', company]]);
        return res.json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
