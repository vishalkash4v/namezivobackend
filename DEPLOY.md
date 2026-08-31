# Deploying namezivobackend on Vercel

## Error: `Protected deployment` (401)

If you see this response:

```json
{
  "error": { "message": "Protected deployment", "code": "401" },
  "protection": { "vercel_auth_enabled": true }
}
```

**Vercel Authentication** is enabled on your project. It blocks all public API calls (curl, Postman, your frontend) until you disable it.

This is **not a backend code bug** — it is a Vercel project setting.

---

## Fix (recommended): Disable Deployment Protection in Dashboard

1. Open [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project **namezivobackend**
3. Go to **Settings** → **Deployment Protection**
4. Under **Vercel Authentication**, click **Disable** (or set to off for Production)
5. For a public API, disable for:
   - **Production** (required)
   - **Preview** (required if you test preview URLs like `namezivobackend-xxx.vercel.app`)
6. **Redeploy** (optional — protection change applies immediately to new requests)

Docs: [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)

---

## Fix (CLI/API): Disable via script

If you have a [Vercel access token](https://vercel.com/account/tokens):

```bash
cd backend/namezivobackend
set VERCEL_TOKEN=your_token_here
node scripts/disable-vercel-protection.js namezivobackend
```

This sends `PATCH /v9/projects/{name}` with `{ "ssoProtection": null }`.

---

## Alternative: Keep protection, use bypass secret

If you want protection ON but need server-to-server access:

1. Vercel → **Settings** → **Deployment Protection** → **Protection Bypass for Automation**
2. Generate a secret
3. Send header on every request:

```bash
curl https://your-api.vercel.app/health \
  -H "x-vercel-protection-bypass: YOUR_BYPASS_SECRET"
```

**Do not** expose this secret in frontend browser code — only use server-side.

---

## Vercel project settings

| Setting | Value |
|---------|--------|
| Root Directory | `backend/namezivobackend` |
| Framework Preset | Other |
| Build Command | *(empty)* |
| Output Directory | *(empty)* |

## Environment variables

Set in **Project Settings → Environment Variables**:

| Variable | Required | Example |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes (AI routes) | `AIza...` |
| `JWT_SECRET` | Yes (auth) | long random string |
| `CORS_ORIGIN` | Yes (frontend) | `https://your-frontend.vercel.app` |

---

## Test after disabling protection

```bash
curl https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/health
```

Expected:

```json
{"status":"ok","service":"namezivobackend"}
```

```bash
curl -X POST https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/api/check \
  -H "Content-Type: application/json" \
  -d "{\"domains\":[\"testxyz123abc\"]}"
```

---

## Use production URL for frontend

After deploy, set in your Next.js `.env`:

```
BACKEND_URL=https://namezivobackend.vercel.app
```

Use your **production** domain (not preview URL) for stable public API access.
