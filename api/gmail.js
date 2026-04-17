const MATON_KEY = process.env.MATON_API_KEY;
const GW = 'https://gateway.maton.ai/google-mail';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'check_replies') {
      // Search Gmail for replies from contacts
      const query = req.query.q || 'is:inbox subject:AgriMalaysia newer_than:30d';
      const url = `${GW}/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
      const listRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${MATON_KEY}` }
      });
      const listData = await listRes.json();

      if (!listData.messages || listData.messages.length === 0) {
        return res.json({ replies: [], total: 0 });
      }

      // Get details for each message
      const replies = [];
      const msgs = listData.messages.slice(0, 20); // limit to 20
      for (const msg of msgs) {
        const detailRes = await fetch(`${GW}/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${MATON_KEY}` }
        });
        const detail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Extract email from "Name <email>" format
        const emailMatch = from.match(/<(.+?)>/) || [null, from];
        replies.push({
          from: emailMatch[1] || from,
          fromFull: from,
          subject,
          date,
          id: msg.id
        });
      }

      return res.json({ replies, total: listData.resultSizeEstimate || replies.length });
    }

    if (action === 'search') {
      const q = req.query.q || '';
      const url = `${GW}/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=20`;
      const listRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${MATON_KEY}` }
      });
      return res.json(await listRes.json());
    }

    return res.status(400).json({ error: 'Unknown action. Use: check_replies, search' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
