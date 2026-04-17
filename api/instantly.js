const MATON_KEY = process.env.MATON_API_KEY;
const GW = 'https://gateway.maton.ai/instantly';

async function instantlyGet(path) {
  const res = await fetch(`${GW}${path}`, {
    headers: { 'Authorization': `Bearer ${MATON_KEY}` }
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'campaigns') {
      const data = await instantlyGet('/api/v1/campaign/list?limit=100&skip=0');
      return res.json(data);
    }

    if (action === 'campaign_stats') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing campaign id' });
      const data = await instantlyGet(`/api/v1/analytics/campaign/summary?campaign_id=${id}`);
      return res.json(data);
    }

    if (action === 'leads') {
      const campaignId = req.query.campaign_id;
      const data = await instantlyGet(`/api/v2/leads?limit=100${campaignId ? '&campaign_id=' + campaignId : ''}`);
      return res.json(data);
    }

    if (action === 'lead_status') {
      // Get leads with their status
      const campaignId = req.query.campaign_id;
      const data = await instantlyGet(`/api/v2/leads?limit=200${campaignId ? '&campaign_id=' + campaignId : ''}`);
      return res.json(data);
    }

    return res.status(400).json({ error: 'Unknown action. Use: campaigns, campaign_stats, leads, lead_status' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
