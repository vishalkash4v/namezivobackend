const {
  checkDomainAvailability,
  scoreDomain,
  generateSuggestions,
  chunkedPromiseAll,
  mapDomainResult,
} = require('../lib/domain-checker');
const {
  getUser,
  getUserByApiKey,
  createUser,
  updateUserPlan,
  generateNewApiKey,
  getUsage,
  incrementUsage,
  getPlanLimits,
} = require('../lib/db');
const { hashPassword, verifyPassword, createToken, verifyToken } = require('../lib/auth');
const { callGemini, safeJsonParse, GeminiError } = require('../lib/gemini');
const { getClientIp, rateLimit } = require('../lib/rate-limit');
const { parseCheckInput, normalizeBody, parseNumberField } = require('../lib/form-data');

const DEFAULT_TLDS = ['com', 'in', 'au', 'site', 'ai', 'net', 'org', 'io', 'co'];

async function resolveAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.split(' ')[1];
    const user = getUserByApiKey(apiKey);
    return user ? { user, apiKey } : { error: 'Invalid API key', status: 401 };
  }

  const token = req.cookies?.auth_token;
  if (token) {
    const payload = await verifyToken(token);
    if (payload?.email) {
      const user = getUser(payload.email);
      if (user) return { user, apiKey: user.apiKey };
    }
  }

  return { user: null, apiKey: null };
}

function expandDomains(domains, tlds) {
  const activeTlds = Array.isArray(tlds) && tlds.length > 0
    ? tlds.map((t) => String(t).replace(/^\./, ''))
    : DEFAULT_TLDS;

  const expanded = [];
  for (const d of domains) {
    const clean = String(d).trim().toLowerCase();
    if (!clean) continue;
    if (!clean.includes('.')) {
      activeTlds.forEach((tld) => expanded.push(`${clean}.${tld}`));
    } else {
      expanded.push(clean);
    }
  }
  return expanded;
}

const analyzeFallback = (seed) => ({
  overall: 80 + (seed % 15),
  brand: 82 + (seed % 13),
  memo: 78 + (seed % 16),
  pron: 85 + (seed % 12),
  seo: 72 + (seed % 18),
  unique: 76 + (seed % 17),
  trust: 80 + (seed % 14),
  insights: [
    'Strong opening consonant — easy to read in icons and ads.',
    'Two to three syllables — optimal for verbal recall.',
    'Low immediate trademark conflict signal detected.',
    'Consider .com, .ai, and .so for premium positioning.',
  ],
});

module.exports = {
  checkDomains: async (req, res) => {
    try {
      const auth = await resolveAuthUser(req);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const { domains, tlds } = parseCheckInput(req);
      if (!domains.length) {
        return res.status(400).json({
          error: 'Invalid input. Send domains as JSON array, form field, or upload a CSV/TXT file.',
        });
      }

      const domainsToCheck = expandDomains(domains, tlds).slice(0, 50);
      if (domainsToCheck.length === 0) {
        return res.status(400).json({ error: 'No valid domains provided.' });
      }

      const today = new Date().toISOString().split('T')[0];

      if (auth.user && auth.apiKey) {
        const currentUsage = getUsage(auth.apiKey, today);
        const limit = getPlanLimits(auth.user.plan);
        if (currentUsage + domainsToCheck.length > limit) {
          return res.status(429).json({
            error: `Rate limit exceeded for plan ${auth.user.plan}. Limit: ${limit}/day, Current: ${currentUsage}, Requested: ${domainsToCheck.length}`,
          });
        }
        incrementUsage(auth.apiKey, today, domainsToCheck.length);
      } else {
        const ip = getClientIp(req);
        const rl = rateLimit({ key: `public:check:${ip}`, limit: 500, windowMs: 24 * 60 * 60 * 1000, cost: domainsToCheck.length });
        if (!rl.allowed) {
          return res.status(429).json({ error: 'Public rate limit exceeded. Please sign up for an API key for more requests.' });
        }
      }

      const results = await chunkedPromiseAll(domainsToCheck, 5, checkDomainAvailability);

      const allSuggestions = new Map();
      const checkedSet = new Set(domainsToCheck);

      for (const r of results) {
        if (r.status !== 'AVAILABLE') {
          generateSuggestions(r.domain).forEach((s) => {
            if (!allSuggestions.has(s.domain) && !checkedSet.has(s.domain)) {
              allSuggestions.set(s.domain, s.score);
            }
          });
        }
      }

      const topSuggestions = Array.from(allSuggestions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([domain]) => domain);

      const suggestionResults = (await chunkedPromiseAll(topSuggestions, 5, checkDomainAvailability))
        .filter((s) => s.status === 'AVAILABLE')
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      return res.json({
        results: results.map(mapDomainResult),
        suggestions: suggestionResults.map(mapDomainResult),
      });
    } catch (error) {
      console.error('[checkDomains]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  generateNames: async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rl = rateLimit({ key: `public:generate:${ip}`, limit: 60, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) {
        return res.status(429).json({ error: 'AI generation rate limit reached. Try again in an hour.' });
      }

      const body = normalizeBody(req);
      const count = Math.max(3, Math.min(20, parseNumberField(body.count, 5)));
      const creativity = Math.max(0, Math.min(100, parseNumberField(body.creativity, 60)));
      const temperature = 0.4 + (creativity / 100) * 0.7;

      const toolFocus = body.toolFocus?.trim() || body.toolType?.trim();
      const businessCategory = body.businessCategory?.trim() || body.category?.trim() || body.industry?.trim() || 'general technology';
      const sub = body.subcategory?.trim();
      const keyword = body.keyword?.trim();
      const focus = body.prompt?.trim() || keyword || [toolFocus, businessCategory, sub].filter(Boolean).join(' · ') || 'modern startup';

      const angle = toolFocus
        ? `Naming lens: ${toolFocus}. Tailor syllable rhythm, connotation, and metaphor to that lens while staying unique.`
        : 'Naming lens: high-growth technology company.';

      const systemInstruction = `You are an expert branding consultant specialized in naming category-defining companies.
Your output must be highly brandable, short (2-3 syllables, under 11 characters), pronounceable, and culturally neutral.
Avoid generic AI-appended names. Prefer invented words, compound words, or evocative real words.
${angle}`;

      const prompt = `Generate ${count} highly brandable names with these constraints:
- Business vertical: ${businessCategory}
${sub ? `- Sub-niche / positioning: ${sub}\n` : ''}${keyword ? `- Keyword anchor: ${keyword}\n` : ''}- Tone: ${body.tone ?? 'modern'}
- Style: ${body.style ?? 'invented or compound'}
- Concept: ${focus}

For each name, provide a one-line meaning (max 12 words). Return ONLY valid JSON, no markdown fences.`;

      const text = await callGemini({
        prompt,
        systemInstruction,
        temperature,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { name: { type: 'STRING' }, meaning: { type: 'STRING' } },
            required: ['name', 'meaning'],
          },
        },
      });

      const parsed = safeJsonParse(text);
      if (!parsed || !Array.isArray(parsed)) {
        return res.status(502).json({ error: 'AI returned an unexpected response. Try again.' });
      }

      const names = parsed
        .filter((n) => n && typeof n.name === 'string')
        .slice(0, count)
        .map((n) => {
          const clean = n.name.trim().replace(/[^A-Za-z0-9 -]/g, '');
          const lowered = clean.toLowerCase().replace(/\s+/g, '');
          return {
            name: clean,
            meaning: (n.meaning ?? '').trim(),
            score: Math.round(scoreDomain(`${lowered}.com`) * 10),
          };
        });

      return res.json({ names });
    } catch (error) {
      if (error instanceof GeminiError) return res.status(error.status).json({ error: error.message });
      console.error('[generateNames]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  generateDomains: async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rl = rateLimit({ key: `public:generate-domains:${ip}`, limit: 30, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) {
        return res.status(429).json({ error: 'Domain idea generation rate limit reached. Try again in an hour.' });
      }

      const body = normalizeBody(req);
      const idea = body.idea?.trim();
      if (!idea) {
        return res.status(400).json({ error: 'Business idea is required.' });
      }

      const domainCount = Math.max(5, Math.min(20, parseNumberField(body.count, 15)));
      const text = await callGemini({
        prompt: `Generate ${domainCount} highly brandable, short, and professional domain names for the following idea: "${idea}".
Include a mix of .com, .io, .ai, and .co TLDs.
Do not use numbers or hyphens.
Return ONLY a comma-separated list of domain names, nothing else. Example: fitnova.com, getfit.io, fitzone.ai`,
        temperature: 0.8,
      });

      const domains = text.split(',').map((d) => d.trim().toLowerCase()).filter((d) => d.includes('.'));
      if (domains.length === 0) {
        return res.status(502).json({ error: 'Could not generate domains for this idea.' });
      }

      return res.json({ domains });
    } catch (error) {
      if (error instanceof GeminiError) return res.status(error.status).json({ error: error.message });
      console.error('[generateDomains]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  analyzeName: async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rl = rateLimit({ key: `public:analyze:${ip}`, limit: 60, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) {
        return res.status(429).json({ error: 'Analyzer rate limit reached. Try again in an hour.' });
      }

      const body = normalizeBody(req);
      const name = body.name?.trim();
      if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Provide a name to analyze.' });
      }

      const systemInstruction = 'You are a senior brand strategist. Score brand names across six dimensions on a 0-100 scale and produce concise insights. Be honest and rigorous.';
      const prompt = `Analyze the brand name: "${name}".

Score 0-100 on these dimensions:
- brand: brandability (distinct, ownable, evocative)
- memo: memorability (how easily it sticks)
- pron: pronunciation (ease across languages)
- seo: SEO friendliness (search competition, ambiguity)
- unique: uniqueness vs existing names
- trust: trust signal (sounds credible, not gimmicky)

Also produce an "overall" 0-100 score (not a simple average; weight strategic fit).
Provide 3-5 short "insights" — each 8-16 words, no markdown, no preamble.

Return ONLY this JSON shape:
{ "overall": number, "brand": number, "memo": number, "pron": number, "seo": number, "unique": number, "trust": number, "insights": string[] }`;

      let parsed = null;
      try {
        const text = await callGemini({ prompt, systemInstruction, temperature: 0.4, responseMimeType: 'application/json' });
        parsed = safeJsonParse(text);
      } catch (err) {
        if (err instanceof GeminiError && err.status === 500 && /Missing GEMINI/i.test(err.message)) {
          const seed = name.length * 13 + name.charCodeAt(0);
          return res.json(analyzeFallback(seed));
        }
        throw err;
      }

      if (!parsed) {
        const seed = name.length * 13 + name.charCodeAt(0);
        return res.json(analyzeFallback(seed));
      }

      const clamp = (n) => Math.max(0, Math.min(100, Math.round(typeof n === 'number' ? n : Number(n) || 0)));

      return res.json({
        overall: clamp(parsed.overall),
        brand: clamp(parsed.brand),
        memo: clamp(parsed.memo),
        pron: clamp(parsed.pron),
        seo: clamp(parsed.seo),
        unique: clamp(parsed.unique),
        trust: clamp(parsed.trust),
        insights: Array.isArray(parsed.insights)
          ? parsed.insights.filter((s) => typeof s === 'string').slice(0, 5)
          : analyzeFallback(0).insights,
      });
    } catch (error) {
      if (error instanceof GeminiError) return res.status(error.status).json({ error: error.message });
      console.error('[analyzeName]', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  nicheChat: async (req, res) => {
    try {
      const ip = getClientIp(req);
      const rl = rateLimit({ key: `public:niche-chat:${ip}`, limit: 10, windowMs: 24 * 60 * 60 * 1000 });
      if (!rl.allowed) {
        return res.status(429).json({ error: 'Daily limit reached (10 messages/day). Please upgrade to a paid plan for unlimited access.' });
      }

      const body = normalizeBody(req);
      const { niche, projectInfo, prompt, history } = body;
      if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

      const info = projectInfo || {};
      const systemInstruction = `You are an expert naming consultant and branding assistant specializing in the ${niche || 'business'} industry.
The user is building a project described as: "${info.description || ''}".
Their target audience is: "${info.audience || ''}".
The desired brand tone is: "${info.tone || ''}".

Your goal is to help them brainstorm domain names, brand names, and keywords.
Keep your responses concise, creative, and highly relevant to their specific project.
Do not use markdown formatting like bolding or lists unless necessary, keep it conversational.`;

      let contents = '';
      if (history?.length > 0) {
        contents += 'Previous conversation context:\n';
        history.forEach((msg) => {
          contents += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
        });
        contents += '\n';
      }
      contents += `User: ${prompt}`;

      const reply = await callGemini({ prompt: contents, systemInstruction, temperature: 0.7 });
      return res.json({ reply });
    } catch (error) {
      if (error instanceof GeminiError) {
        if (error.status === 400) {
          return res.status(400).json({ error: 'Invalid Gemini API Key. Please check your environment variables.' });
        }
        return res.status(error.status).json({ error: error.message });
      }
      console.error('[nicheChat]', error);
      return res.status(500).json({ error: 'Failed to generate response. Please try again.' });
    }
  },

  auth: async (req, res) => {
    try {
      const body = normalizeBody(req);
      const { email, password, action } = body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      let user;
      if (action === 'register') {
        if (getUser(email)) return res.status(400).json({ error: 'User already exists' });
        user = createUser(email, await hashPassword(password));
      } else if (action === 'login') {
        user = getUser(email);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const token = await createToken({ email: user.email, id: user.id });
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  getUserProfile: async (req, res) => {
    try {
      const token = req.cookies?.auth_token;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const payload = await verifyToken(token);
      if (!payload?.email) return res.status(401).json({ error: 'Invalid token' });

      const user = getUser(payload.email);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const today = new Date().toISOString().split('T')[0];
      return res.json({
        email: user.email,
        plan: user.plan,
        apiKey: user.apiKey,
        usage: getUsage(user.apiKey, today),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },

  userActions: async (req, res) => {
    try {
      const token = req.cookies?.auth_token;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const payload = await verifyToken(token);
      if (!payload?.email) return res.status(401).json({ error: 'Invalid token' });

      const body = normalizeBody(req);
      const { action, plan } = body;

      if (action === 'update_plan') {
        if (!['Free', 'Pro', 'Business', 'Enterprise'].includes(plan)) {
          return res.status(400).json({ error: 'Invalid plan' });
        }
        updateUserPlan(payload.email, plan);
        return res.json({ success: true, plan });
      }

      if (action === 'regenerate_key') {
        const newKey = generateNewApiKey(payload.email);
        return res.json({ success: true, apiKey: newKey });
      }

      if (action === 'logout') {
        res.clearCookie('auth_token');
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  },
};
