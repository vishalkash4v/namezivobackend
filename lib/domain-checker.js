const dns = require('dns').promises;
const net = require('net');

const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

const WHOIS_SERVERS = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  in: 'whois.registry.in',
  site: 'whois.centralnic.com',
  ai: 'whois.nic.ai',
  app: 'whois.nic.google',
  dev: 'whois.nic.google',
  tech: 'whois.centralnic.com',
  hq: 'whois.identitydigital.services',
  me: 'whois.nic.me',
  tv: 'whois.nic.tv',
  cc: 'whois.verisign-grs.com',
  au: 'whois.auda.org.au',
};

const RDAP_SERVERS = {
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
  org: 'https://rdap.publicinterestregistry.org/rdap/',
  io: 'https://rdap.identitydigital.services/rdap/',
  co: 'https://rdap.nic.co/',
  site: 'https://rdap.centralnic.com/site/',
  online: 'https://rdap.centralnic.com/online/',
  store: 'https://rdap.centralnic.com/store/',
  tech: 'https://rdap.centralnic.com/tech/',
};

function resolveWithTimeout(promise, timeoutMs) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

function queryWhoisServer(domain, server, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let data = '';
    let isDone = false;

    const cleanup = () => {
      if (!isDone) {
        isDone = true;
        client.destroy();
      }
    };

    const fallbackTimeout = setTimeout(() => {
      cleanup();
      reject(new Error('WHOIS overall timeout'));
    }, timeoutMs + 500);

    client.setTimeout(timeoutMs);
    client.on('timeout', () => {
      clearTimeout(fallbackTimeout);
      cleanup();
      reject(new Error('WHOIS socket timeout'));
    });
    client.on('error', (err) => {
      clearTimeout(fallbackTimeout);
      cleanup();
      reject(err);
    });
    client.on('data', (chunk) => { data += chunk.toString(); });
    client.on('close', () => {
      clearTimeout(fallbackTimeout);
      cleanup();
      resolve(data);
    });
    client.connect(43, server, () => client.write(`${domain}\r\n`));
  });
}

async function checkWhois(domain, retries = 1) {
  const tld = domain.split('.').pop() || '';
  let server = WHOIS_SERVERS[tld] || 'whois.iana.org';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let data = await resolveWithTimeout(queryWhoisServer(domain, server, 3000), 3500);
      if (!data || !data.trim()) {
        if (attempt === retries) return 'UNKNOWN';
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (server === 'whois.iana.org') {
        const match = data.match(/whois:\s+([a-zA-Z0-9\-\.]+)/i);
        if (match && match[1]) {
          server = match[1];
          data = await resolveWithTimeout(queryWhoisServer(domain, server, 3000), 3500);
        } else {
          return 'UNKNOWN';
        }
      }

      const lowerData = data.toLowerCase();
      const isCentralNic = ['site', 'online', 'store', 'tech'].includes(tld);
      if (isCentralNic) {
        return lowerData.includes('not found') ? 'AVAILABLE' : 'TAKEN';
      }

      const availableIndicators = ['no match for', 'not found', 'no data found', 'domain not found'];
      if (availableIndicators.some((i) => lowerData.includes(i))) return 'AVAILABLE';
      return 'TAKEN';
    } catch {
      if (attempt === retries) return 'UNKNOWN';
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return 'UNKNOWN';
}

async function checkRDAP(domain, retries = 2) {
  const tld = domain.split('.').pop() || '';
  const server = RDAP_SERVERS[tld];
  if (!server) return 'UNKNOWN';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${server}domain/${domain}`, {
        signal: controller.signal,
        headers: { Accept: 'application/rdap+json' },
      });
      clearTimeout(timeoutId);
      if (res.status === 200) return 'TAKEN';
      if (res.status === 404) return 'AVAILABLE';
      return 'UNKNOWN';
    } catch {
      if (attempt === retries) return 'UNKNOWN';
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return 'UNKNOWN';
}

function isPremiumDomain(domain) {
  const parts = domain.split('.');
  const name = parts[0];
  if (name.length <= 5) return true;
  const KNOWN_BRANDS = ['google', 'facebook', 'amazon', 'microsoft', 'apple', 'netflix'];
  if (KNOWN_BRANDS.some((b) => name === b)) return true;
  const PREMIUM_KEYWORDS = ['fitness', 'crypto', 'loan', 'insurance', 'travel', 'shop', 'ai', 'cloud'];
  if (PREMIUM_KEYWORDS.some((k) => name === k || name.includes(k))) return true;
  if (/^[a-z]+$/.test(name) && name.length <= 8) return true;
  return false;
}

function scoreDomain(domain) {
  let score = 10;
  const parts = domain.split('.');
  const name = parts[0];
  const tld = parts.slice(1).join('.');
  if (name.length > 10) score -= 2;
  if (/[0-9\-]/.test(name)) score -= 2;
  if (name.length > 8 || name.includes('-')) score -= 1;
  const commonTlds = ['com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev'];
  if (!commonTlds.includes(tld)) score -= 1;
  if (tld !== 'com') score -= 1;
  return Math.max(3, Math.min(10, score));
}

function generateSuggestions(domain) {
  const parts = domain.split('.');
  if (parts.length < 2) return [];
  const name = parts[0].replace(/[^a-z0-9]/g, '');
  const tld = parts.slice(1).join('.');
  const suggestions = new Set();
  const commonTlds = ['com', 'in', 'au', 'site', 'ai', 'net', 'org', 'io', 'co', 'app', 'dev', 'tech', 'hq'];
  const prefixes = ['get', 'my', 'the', 'try', 'go', 'use', 'hello'];
  const suffixes = ['app', 'online', 'tech', 'hq', 'hub', 'labs', 'pro', 'ai', 'ify'];

  for (const ctld of commonTlds) {
    if (ctld !== tld) suggestions.add(`${name}.${ctld}`);
  }
  for (const prefix of prefixes) {
    suggestions.add(`${prefix}${name}.${tld}`);
    suggestions.add(`${prefix}${name}.com`);
  }
  for (const suffix of suffixes) {
    suggestions.add(`${name}${suffix}.${tld}`);
    suggestions.add(`${name}${suffix}.com`);
  }

  return Array.from(suggestions)
    .map((d) => ({ domain: d, score: scoreDomain(d) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

async function checkDomainAvailability(domain) {
  const cleanDomain = domain.trim().toLowerCase();
  const cached = cache.get(cleanDomain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

  const result = {
    domain: cleanDomain,
    status: 'UNKNOWN',
    sources: { whois: 'UNKNOWN', rdap: 'UNKNOWN' },
    confidence: 'LOW',
    score: scoreDomain(cleanDomain),
  };

  const isPremium = isPremiumDomain(cleanDomain);
  const [whoisStatus, rdapStatus] = await Promise.all([
    checkWhois(cleanDomain),
    checkRDAP(cleanDomain),
  ]);

  result.sources.whois = whoisStatus;
  result.sources.rdap = rdapStatus;

  if (whoisStatus === 'TAKEN' || rdapStatus === 'TAKEN') {
    result.status = 'TAKEN';
    if (whoisStatus === 'TAKEN' && rdapStatus === 'TAKEN') result.confidence = 'HIGH';
    else if (whoisStatus === 'UNKNOWN' || rdapStatus === 'UNKNOWN') result.confidence = 'MEDIUM';
    else result.confidence = 'LOW';
  } else if (whoisStatus === 'AVAILABLE' && rdapStatus === 'AVAILABLE') {
    result.status = 'AVAILABLE';
    result.confidence = 'HIGH';
    if (isPremium) {
      result.premium = true;
      result.premiumType = 'LIKELY';
      result.confidence = 'MEDIUM';
    }
  } else {
    result.status = 'UNKNOWN';
    result.confidence = whoisStatus === 'UNKNOWN' && rdapStatus === 'UNKNOWN' ? 'LOW' : 'MEDIUM';
  }

  if (result.status !== 'UNKNOWN') {
    cache.set(cleanDomain, { result, timestamp: Date.now() });
  }
  return result;
}

async function chunkedPromiseAll(items, chunkSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

function mapDomainResult(r) {
  return {
    domain: r.domain,
    status: r.status,
    score: r.score,
    sources: r.sources,
    confidence: r.confidence,
    premium: !!r.premium,
    premiumType: r.premiumType || null,
  };
}

module.exports = {
  checkDomainAvailability,
  scoreDomain,
  generateSuggestions,
  chunkedPromiseAll,
  mapDomainResult,
};
