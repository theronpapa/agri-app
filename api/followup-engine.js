const MATON_KEY = process.env.MATON_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const SHEET_ID = '1w9OZLWwKaZl_eOLC_7aEmrIuETRGc4zpQ8-qY0PN4yk';
const GW_SHEETS = 'https://gateway.maton.ai/google-sheets/v4/spreadsheets';
const GW_GMAIL = 'https://gateway.maton.ai/google-mail';

const FOLLOWUP_SCHEDULE = { 1: 5, 2: 12, 3: 20 };

const FOLLOWUP_TEMPLATES = {
  1: {
    subject: 'Following up — AgriMalaysia 2026 Exhibition Booth',
    body: (company, contact) => `Dear ${contact || 'Sir/Madam'},

I wanted to follow up on our earlier invitation for ${company} to exhibit at AgriMalaysia 2026 (Sept 10-12, MITEC KL).

Here's what's been confirmed since we last wrote:
- 15,000+ trade visitors expected from across Southeast Asia
- 40 international delegations confirmed
- Smart farming, precision agriculture, and food security zones now mapped out
- Early-bird booth packages still available

We'd love to have ${company} represented at the event. Would you have any questions about booth options or the exhibition layout?

Happy to arrange a quick call at your convenience.

Warm regards,
Derek Chay
MiffitouTech
AgriMalaysia 2026 Organizing Committee`
  },
  2: {
    subject: 'Last chance — AgriMalaysia 2026 booth spaces filling fast',
    body: (company, contact) => `Dear ${contact || 'Sir/Madam'},

This is a final reminder about our invitation to AgriMalaysia 2026 (Sept 10-12, MITEC KL).

Booth spaces are filling up quickly — over 60% of premium locations have been reserved. We don't want ${company} to miss this opportunity to connect with 15,000+ qualified agricultural buyers.

Early-bird pricing ends soon. Premium Booth: 6m x 6m — RM15,000. Standard Booth: 3m x 3m — RM8,000.

If you're interested, simply reply to this email and we'll hold a spot for you. If the timing isn't right, no worries at all.

Best regards,
Derek Chay
MiffitouTech
AgriMalaysia 2026 Organizing Committee`
  },
  3: {
    subject: 'Final update — AgriMalaysia 2026',
    body: (company, contact) => `Dear ${contact || 'Sir/Madam'},

This will be our last message regarding AgriMalaysia 2026. We understand you may have other priorities right now.

Just in case: we still have a limited number of booth spaces available. If ${company} would like to participate, we're happy to accommodate — just reply to this email.

If this isn't relevant, we won't follow up further. Thank you for your time.

Best regards,
Derek Chay
MiffitouTech
AgriMalaysia 2026 Organizing Committee`
  }
};

async function sheetsGet(range) {
  const res = await fetch(`${GW_SHEETS}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
    headers: { 'Authorization': `Bearer ${MATON_KEY}` }
  });
  const data = await res.json();
  return data.values || [];
}

async function sheetsUpdate(range, values) {
  await fetch(`${GW_SHEETS}/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${MATON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
}

async function sheetsAppend(range, values) {
  await fetch(`${GW_SHEETS}/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MATON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
}

async function sendGmail(to, subject, body) {
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    body
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(`${GW_GMAIL}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MATON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded })
  });

  const result = await res.json();
  if (result.error) throw new Error(result.error.message || 'Gmail send failed');
  return result;
}

async function checkGmailReplies(email) {
  const query = encodeURIComponent(`from:${email}`);
  const res = await fetch(`${GW_GMAIL}/gmail/v1/users/me/messages?q=${query}&maxResults=5`, {
    headers: { 'Authorization': `Bearer ${MATON_KEY}` }
  });
  const data = await res.json();
  return (data.messages || []).length > 0;
}

async function generateAIFollowup(company, contact, round, category) {
  if (!CLAUDE_KEY) return null;

  const roundLabel = round === 1 ? 'first (gentle value-add)' : round === 2 ? 'second (urgency)' : 'third and final';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You write follow-up emails for AgriMalaysia 2026 exhibition (10-12 Sept 2026, MITEC KL). Organizer: Derek Chay, MiffitouTech. Premium Booth: 6m x 6m — RM15,000. Standard Booth: 3m x 3m — RM8,000.`,
      messages: [{ role: 'user', content: `Write a ${roundLabel} follow-up email for:
- Company: ${company}
- Contact: ${contact || 'unknown'}
- Category: ${category}
- They were invited before but haven't replied.

${round === 1 ? 'Be gentle, add value with exhibition highlights.' : round === 2 ? 'Add urgency — booths filling up fast, early-bird ending soon.' : 'This is the final message. Be gracious, say you won\'t follow up again.'}

Keep under 150 words. Sign off as Derek Chay, MiffitouTech.

Respond in JSON: {"subject": "...", "body": "..."}` }]
    })
  });

  const data = await res.json();
  if (data.error) return null;

  const text = data.content?.[0]?.text || '';
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    // GET pipeline summary
    if (req.method === 'GET' && action === 'pipeline') {
      const rows = await sheetsGet('Contacts!A1:O');
      if (rows.length < 2) return res.json({ stages: {}, total: 0 });

      const headers = rows[0];
      const stageIdx = headers.indexOf('Pipeline Stage');
      const statusIdx = headers.indexOf('Status');

      const stages = { NEW: 0, CONTACTED: 0, REPLIED: 0, REGISTERED: 0, BOOTH_CONFIRMED: 0, NO_REPLY: 0, NOT_INTERESTED: 0 };

      for (let i = 1; i < rows.length; i++) {
        if (!rows[i][3]) continue; // skip rows without email
        const stage = (stageIdx >= 0 && rows[i][stageIdx]) || 'NEW';
        // Map old Status values to pipeline stages
        const status = statusIdx >= 0 ? rows[i][statusIdx] : '';
        let mapped = stage;
        if (stage === 'NEW' && status === 'Contacted') mapped = 'CONTACTED';
        if (stage === 'NEW' && status === 'Replied') mapped = 'REPLIED';
        if (stage === 'NEW' && status === 'Interested') mapped = 'REPLIED';
        if (stage === 'NEW' && status === 'Confirmed') mapped = 'REGISTERED';
        if (stage === 'NEW' && status === 'Not Interested') mapped = 'NOT_INTERESTED';

        if (stages[mapped] !== undefined) stages[mapped]++;
        else stages.NEW++;
      }

      return res.json({ stages, total: rows.length - 1 });
    }

    // POST check_replies - scan Gmail for replies and update pipeline
    if (req.method === 'POST' && action === 'check_replies') {
      const rows = await sheetsGet('Contacts!A1:O');
      if (rows.length < 2) return res.json({ checked: 0, replied: 0 });

      const headers = rows[0];
      const emailIdx = headers.indexOf('Email');
      const stageIdx = headers.indexOf('Pipeline Stage');
      const replyDateIdx = headers.indexOf('Reply Date');

      let checked = 0, replied = 0;

      for (let i = 1; i < rows.length; i++) {
        const stage = rows[i][stageIdx] || '';
        const email = rows[i][emailIdx] || '';
        if (!email || stage === 'REPLIED' || stage === 'REGISTERED' || stage === 'BOOTH_CONFIRMED' || stage === 'NOT_INTERESTED') continue;
        if (stage !== 'CONTACTED') continue;

        checked++;
        const hasReply = await checkGmailReplies(email);
        if (hasReply) {
          replied++;
          const rowIdx = i + 1;
          // Update Pipeline Stage to REPLIED and set Reply Date
          if (stageIdx >= 0) await sheetsUpdate(`Contacts!${String.fromCharCode(65 + stageIdx)}${rowIdx}`, [['REPLIED']]);
          if (replyDateIdx >= 0) await sheetsUpdate(`Contacts!${String.fromCharCode(65 + replyDateIdx)}${rowIdx}`, [[new Date().toISOString()]]);
          // Also update Status column
          const statusIdx = headers.indexOf('Status');
          if (statusIdx >= 0) await sheetsUpdate(`Contacts!${String.fromCharCode(65 + statusIdx)}${rowIdx}`, [['Replied']]);
          // Log activity
          await sheetsAppend('Activity!A1', [[new Date().toISOString(), 'System', 'Reply Detected', `${rows[i][2] || rows[i][1]} replied via Gmail`]]);
        }
      }

      return res.json({ checked, replied });
    }

    // POST send_followups - send follow-up emails based on schedule
    if (req.method === 'POST' && action === 'send_followups') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const useAI = body.useAI !== false && !!CLAUDE_KEY;
      const limit = body.limit || 20;

      const rows = await sheetsGet('Contacts!A1:O');
      if (rows.length < 2) return res.json({ sent: 0, skipped: 0 });

      const headers = rows[0];
      const emailIdx = headers.indexOf('Email');
      const companyIdx = headers.indexOf('Company');
      const nameIdx = headers.indexOf('Name');
      const categoryIdx = headers.indexOf('Category');
      const stageIdx = headers.indexOf('Pipeline Stage');
      const emailSentIdx = headers.indexOf('Email Sent Date');
      const fu1Idx = headers.indexOf('Followup 1 Sent');
      const fu2Idx = headers.indexOf('Followup 2 Sent');
      const fu3Idx = headers.indexOf('Followup 3 Sent');

      const now = new Date();
      let sent = 0, skipped = 0;
      const results = [];

      for (let i = 1; i < rows.length && sent < limit; i++) {
        const stage = rows[i][stageIdx] || '';
        const email = rows[i][emailIdx] || '';
        if (!email || stage !== 'CONTACTED') continue;

        const emailSentDate = rows[i][emailSentIdx] || '';
        if (!emailSentDate) continue;

        const daysSince = Math.floor((now - new Date(emailSentDate)) / (1000 * 60 * 60 * 24));
        const fu1 = rows[i][fu1Idx] || '';
        const fu2 = rows[i][fu2Idx] || '';
        const fu3 = rows[i][fu3Idx] || '';

        let roundToSend = 0;
        if (!fu1 && daysSince >= FOLLOWUP_SCHEDULE[1]) roundToSend = 1;
        else if (fu1 && !fu2 && daysSince >= FOLLOWUP_SCHEDULE[2]) roundToSend = 2;
        else if (fu2 && !fu3 && daysSince >= FOLLOWUP_SCHEDULE[3]) roundToSend = 3;

        if (roundToSend === 0) { skipped++; continue; }

        const company = rows[i][companyIdx] || '';
        const contact = rows[i][nameIdx] || '';
        const category = rows[i][categoryIdx] || '';
        const rowIdx = i + 1;

        try {
          let emailContent;
          if (useAI) {
            emailContent = await generateAIFollowup(company, contact, roundToSend, category);
          }
          if (!emailContent) {
            const tmpl = FOLLOWUP_TEMPLATES[roundToSend];
            emailContent = { subject: tmpl.subject, body: tmpl.body(company, contact ? contact.split(' ')[0] : 'Sir/Madam') };
          }

          await sendGmail(email, emailContent.subject, emailContent.body);

          // Update the followup date column
          const fuColIdx = roundToSend === 1 ? fu1Idx : roundToSend === 2 ? fu2Idx : fu3Idx;
          if (fuColIdx >= 0) {
            await sheetsUpdate(`Contacts!${String.fromCharCode(65 + fuColIdx)}${rowIdx}`, [[now.toISOString()]]);
          }

          // If round 3, mark as NO_REPLY
          if (roundToSend === 3 && stageIdx >= 0) {
            await sheetsUpdate(`Contacts!${String.fromCharCode(65 + stageIdx)}${rowIdx}`, [['NO_REPLY']]);
          }

          // Log to Emails sheet
          await sheetsAppend('Emails!A1', [[
            `FU-${Date.now()}`, company, email, emailContent.subject, now.toISOString(), 'Sent', `Follow-up ${roundToSend}`, ''
          ]]);

          // Log activity
          await sheetsAppend('Activity!A1', [[now.toISOString(), 'System', 'Follow-up Sent', `Round ${roundToSend} to ${company}`]]);

          sent++;
          results.push({ company, email, round: roundToSend, ok: true });
        } catch (err) {
          results.push({ company, email, round: roundToSend, ok: false, error: err.message });
        }
      }

      return res.json({ sent, skipped, results, ai: useAI });
    }

    // POST move_stage - manually move a contact to a different pipeline stage
    if (req.method === 'POST' && action === 'move_stage') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { contactId, stage } = body;
      if (!contactId || !stage) return res.status(400).json({ error: 'contactId and stage required' });

      const rows = await sheetsGet('Contacts!A1:O');
      const headers = rows[0];
      const stageIdx = headers.indexOf('Pipeline Stage');
      if (stageIdx < 0) return res.status(400).json({ error: 'Pipeline Stage column not found' });

      let rowIdx = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === String(contactId)) { rowIdx = i + 1; break; }
      }
      if (rowIdx < 0) return res.status(404).json({ error: 'Contact not found' });

      await sheetsUpdate(`Contacts!${String.fromCharCode(65 + stageIdx)}${rowIdx}`, [[stage]]);

      // Also update Status column to match
      const statusMap = { NEW: 'New', CONTACTED: 'Contacted', REPLIED: 'Replied', REGISTERED: 'Confirmed', BOOTH_CONFIRMED: 'Confirmed', NO_REPLY: 'Not Interested', NOT_INTERESTED: 'Not Interested' };
      const statusIdx = headers.indexOf('Status');
      if (statusIdx >= 0 && statusMap[stage]) {
        await sheetsUpdate(`Contacts!${String.fromCharCode(65 + statusIdx)}${rowIdx}`, [[statusMap[stage]]]);
      }

      await sheetsAppend('Activity!A1', [[new Date().toISOString(), req.query.user || 'Admin', 'Pipeline Move', `Contact ${contactId} → ${stage}`]]);

      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action. Use: pipeline, check_replies, send_followups, move_stage' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
