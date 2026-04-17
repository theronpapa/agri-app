const MATON_KEY = process.env.MATON_API_KEY;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
const GW_GMAIL = 'https://gateway.maton.ai/google-mail';

const EVENT = {
  name: 'AgriMalaysia 2026',
  tagline: "Malaysia's Largest Agriculture Technology Exhibition",
  venue: 'Malaysia International Trade & Exhibition Centre (MITEC), Kuala Lumpur',
  dates: '10 - 12 September 2026',
  organizer: 'MiffitouTech',
  contact: 'Derek Chay',
  premiumBooth: '6m x 6m — RM15,000',
  standardBooth: '3m x 3m — RM8,000'
};

const SYSTEM_PROMPT = `You are an AI email writer for ${EVENT.name}, ${EVENT.tagline}.

Event details:
- Dates: ${EVENT.dates}
- Venue: ${EVENT.venue}
- Organizer: ${EVENT.organizer}, contact person: ${EVENT.contact}
- Premium Booth: ${EVENT.premiumBooth}
- Standard Booth: ${EVENT.standardBooth}

Your job: Write a personalized, professional exhibitor invitation email.

Instructions:
- Research what you know about the company. Reference something SPECIFIC about them — their products, recent news, market position, or industry role. Do NOT be generic.
- Explain why THIS specific company would benefit from exhibiting, based on who they are and what they do.
- Keep it warm, professional, and concise (under 250 words for the body).
- Include booth pricing naturally in the email.
- End with a clear call-to-action (schedule a call or reply to confirm interest).
- Sign off as Derek Chay, ${EVENT.organizer}, ${EVENT.name} Organizing Committee.
- Write in plain text, no markdown formatting, no bold markers.
- If you don't know much about the company, use their category and location intelligently — don't make up false facts.`;

async function generateWithAI(contact) {
  const { Name, Company, Email, Category, Location } = contact;
  const firstName = Name ? Name.split(' ')[0] : 'Sir/Madam';

  const userPrompt = `Write an exhibitor invitation email for:
- Company: ${Company}
- Contact person: ${Name || 'unknown'}
- Category: ${Category}
- Location: ${Location}
- Email: ${Email}

Generate TWO things:
1. A compelling email subject line (short, under 60 chars)
2. The full email body addressed to ${firstName}

Respond in this exact JSON format:
{"subject": "...", "body": "..."}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Claude API error');

  const text = data.content?.[0]?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else parsed = { subject: `Exhibitor Invitation: ${EVENT.name} — ${Company}`, body: text };
  }

  return {
    to: Email,
    subject: parsed.subject,
    body: parsed.body,
    company: Company,
    name: Name,
    category: Category
  };
}

function generateTemplate(contact) {
  const { Name, Company, Email, Category, Location } = contact;
  const firstName = Name ? Name.split(' ')[0] : 'Sir/Madam';

  const subject = `Exhibitor Invitation: ${EVENT.name} — ${EVENT.dates} at MITEC KL`;
  const body = `Dear ${firstName},

Greetings from the ${EVENT.name} organizing team.

We are organizing ${EVENT.name} — ${EVENT.tagline} — taking place on ${EVENT.dates} at the ${EVENT.venue}.

As a ${Category} company based in ${Location}, ${Company} would be an excellent fit for our exhibition. We believe your presence would add tremendous value to our attendees and create meaningful business opportunities for your team.

Exhibitor Packages:
- Premium Booth (${EVENT.premiumBooth}) — prime location, maximum visibility
- Standard Booth (${EVENT.standardBooth}) — excellent value, high foot traffic

Early confirmed exhibitors receive priority placement and inclusion in all pre-event marketing materials.

I would love to schedule a quick call to discuss how ${Company} can make the most of ${EVENT.name}. Would you have 15 minutes this week?

Looking forward to hearing from you.

Warm regards,
${EVENT.contact}
${EVENT.organizer}
${EVENT.name} Organizing Committee`;

  return { to: Email, subject, body, company: Company, name: Name, category: Category };
}

// Process AI calls in parallel batches of 5
async function generateBatchAI(contacts) {
  const BATCH_SIZE = 5;
  const emails = [];
  const errors = [];

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(c => generateWithAI(c))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        emails.push(results[j].value);
      } else {
        errors.push({ company: batch[j].Company, error: results[j].reason?.message || 'Unknown error' });
        emails.push(generateTemplate(batch[j]));
      }
    }
  }

  return { emails, errors };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'generate') {
      const { contacts } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!contacts || !contacts.length) return res.status(400).json({ error: 'No contacts provided' });

      // Cap at 15 contacts per request to stay within Vercel timeout
      const batch = contacts.slice(0, 15);
      const useAI = !!CLAUDE_KEY;

      let emails, errors;
      if (useAI) {
        const result = await generateBatchAI(batch);
        emails = result.emails;
        errors = result.errors;
      } else {
        emails = batch.map(c => generateTemplate(c));
        errors = [];
      }

      return res.json({
        emails,
        count: emails.length,
        total: contacts.length,
        processed: batch.length,
        ai: useAI,
        errors: errors.length ? errors : undefined
      });
    }

    if (action === 'send') {
      const { to, subject, body } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!to || !subject || !body) return res.status(400).json({ error: 'Missing to, subject, or body' });

      const rawMessage = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        '',
        body.replace(/\*\*/g, '')
      ].join('\r\n');

      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const sendRes = await fetch(`${GW_GMAIL}/gmail/v1/users/me/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MATON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encoded })
      });

      const result = await sendRes.json();
      if (result.error) return res.status(400).json({ error: result.error.message || 'Gmail send failed' });

      return res.json({ ok: true, messageId: result.id });
    }

    if (action === 'send_batch') {
      const { emails } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!emails || !emails.length) return res.status(400).json({ error: 'No emails provided' });

      const results = [];
      for (const email of emails) {
        try {
          const rawMessage = [
            `To: ${email.to}`,
            `Subject: ${email.subject}`,
            `Content-Type: text/plain; charset=UTF-8`,
            '',
            email.body.replace(/\*\*/g, '')
          ].join('\r\n');

          const encoded = Buffer.from(rawMessage)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const sendRes = await fetch(`${GW_GMAIL}/gmail/v1/users/me/messages/send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${MATON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encoded })
          });

          const result = await sendRes.json();
          results.push({ to: email.to, ok: !result.error, id: result.id, error: result.error?.message });
        } catch (e) {
          results.push({ to: email.to, ok: false, error: e.message });
        }
      }

      return res.json({ results, sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
    }

    if (action === 'check') {
      return res.json({ ai: !!CLAUDE_KEY, gmail: !!MATON_KEY });
    }

    return res.status(400).json({ error: 'Unknown action. Use: generate, send, send_batch, check' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
