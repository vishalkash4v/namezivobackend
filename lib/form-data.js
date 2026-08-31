function parseJsonField(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }
  return fallback;
}

function parseListField(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // fall through to delimiter split
      }
    }
    return trimmed
      .split(/[\s,;\n\r\t]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [String(value)];
}

function parseNumberField(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDomainsFromFile(file) {
  if (!file?.buffer) return [];
  return parseListField(file.buffer.toString('utf-8'));
}

function parseCheckInput(req) {
  let domains = [];

  if (req.file) {
    domains = parseDomainsFromFile(req.file);
  } else if (req.body?.domains != null) {
    domains = parseListField(req.body.domains);
  }

  const tlds = req.body?.tlds != null ? parseListField(req.body.tlds) : undefined;
  return { domains, tlds };
}

function normalizeBody(req) {
  const body = { ...(req.body || {}) };

  if (body.projectInfo != null) body.projectInfo = parseJsonField(body.projectInfo, {});
  if (body.history != null) body.history = parseJsonField(body.history, []);
  if (body.count != null) body.count = parseNumberField(body.count, body.count);
  if (body.creativity != null) body.creativity = parseNumberField(body.creativity, body.creativity);

  return body;
}

module.exports = {
  parseJsonField,
  parseListField,
  parseNumberField,
  parseDomainsFromFile,
  parseCheckInput,
  normalizeBody,
};
