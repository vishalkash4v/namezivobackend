# API cURL examples (FormData)

**Base URL:** `https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app`

---

## IMPORTANT: Fix 401 Protected deployment first

If you get `"Protected deployment"` / `vercel_auth_enabled: true`, your API is blocked by [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).

### Option A — Disable protection (recommended for public API)

1. [Vercel Dashboard](https://vercel.com/dashboard) → **namezivobackend**
2. **Settings** → **Deployment Protection**
3. Turn **OFF** **Vercel Authentication** for **Production** and **Preview**
4. Retry curl below

### Option B — Use bypass secret (keep protection on)

1. Vercel → **Settings** → **Deployment Protection** → **Protection Bypass for Automation** → Generate secret
2. Add to every curl: `-H "x-vercel-protection-bypass: YOUR_SECRET"`

---

## Health check

```bash
curl https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/health
```

With bypass header (if protection still on):

```bash
curl https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/health \
  -H "x-vercel-protection-bypass: YOUR_BYPASS_SECRET"
```

---

## 1. Domain check — FormData (keywords)

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" \
  -F "domains=mybrand,startup,testxyz123abc" \
  -F "tlds=com,io,ai"
```

With bypass:

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" \
  -H "x-vercel-protection-bypass: YOUR_BYPASS_SECRET" \
  -F "domains=mybrand,startup" \
  -F "tlds=com,io"
```

---

## 2. Domain check — FormData (file upload CSV/TXT)

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" \
  -F "file=@domains.txt" \
  -F "tlds=com,io,net"
```

---

## 3. Domain check — with API key

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" \
  -H "Authorization: Bearer sk_YOUR_API_KEY" \
  -F "domains=example.com,mybrand" \
  -F "tlds=com"
```

---

## 4. Business name generator — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/generate" \
  -F "toolFocus=Business" \
  -F "businessCategory=SaaS" \
  -F "subcategory=Productivity" \
  -F "keyword=flow" \
  -F "count=5" \
  -F "tone=modern"
```

---

## 5. Generate domains from idea — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/generate-domains" \
  -F "idea=A fitness app for busy professionals" \
  -F "count=15"
```

---

## 6. Brand name analyzer — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/analyze" \
  -F "name=Flowly"
```

---

## 7. Niche chat — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/niche-chat" \
  -F "niche=Business Naming" \
  -F "prompt=Suggest 5 catchy domain names" \
  -F "projectInfo={\"description\":\"A mobile fitness app\",\"audience\":\"Busy professionals\",\"tone\":\"Professional\"}"
```

---

## 8. Register — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/auth" \
  -c cookies.txt \
  -F "action=register" \
  -F "email=user@example.com" \
  -F "password=yourpassword123"
```

---

## 9. Login — FormData

```bash
curl -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/auth" \
  -c cookies.txt \
  -F "action=login" \
  -F "email=user@example.com" \
  -F "password=yourpassword123"
```

---

## 10. Get user profile

```bash
curl "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/user" \
  -b cookies.txt
```

---

## PowerShell (Windows) — domain check FormData

```powershell
curl.exe -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" `
  -F "domains=mybrand,testxyz123abc" `
  -F "tlds=com,io"
```

With bypass:

```powershell
curl.exe -X POST "https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check" `
  -H "x-vercel-protection-bypass: YOUR_BYPASS_SECRET" `
  -F "domains=mybrand" `
  -F "tlds=com,io"
```

---

## Disable protection via script (one-time)

```powershell
cd W:\relaxmain\backend\namezivobackend
$env:VERCEL_TOKEN = "your_token_from_https://vercel.com/account/tokens"
node scripts/disable-vercel-protection.js namezivobackend
```
