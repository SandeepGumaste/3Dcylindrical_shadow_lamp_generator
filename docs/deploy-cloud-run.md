# Deploying the backend to Google Cloud Run

The backend (`backend/`) is one Node server: login (`/api/auth/*`, `/api/me`) and model generation (`POST /api/generate`).
The frontend (`frontend/`) is static and is hosted separately (Vercel today).

## Addresses

Use one registrable domain for both halves so the login cookie is sent: the site on `example.com` (or `www.example.com`)
and the API on `api.example.com`. On free addresses (`*.vercel.app`, `*.run.app`) browsers do not send the cookie.
No cookie `Domain` setting is needed: the API sets a host-only cookie and the two hosts are same-site.

## 1. Database

Create a MongoDB Atlas cluster and a database user. Cloud Run has no fixed outgoing address, so in Atlas Network Access
allow `0.0.0.0/0`; the database user and password are what protects it. Copy the connection string into `MONGODB_URI`.

## 2. Google OAuth client

Authorised redirect URIs: `https://api.example.com/api/auth/callback/google` (production) and
`http://localhost:3001/api/auth/callback/google` (local).

## 3. Deploy

From the repository root:

```bash
gcloud run deploy odd-shadows-api \
  --source backend \
  --region <region> \
  --allow-unauthenticated \
  --concurrency 2 --cpu 1 --memory 1Gi --timeout 60 \
  --set-env-vars "AUTH_URL=https://api.example.com,FRONTEND_ORIGIN=https://example.com,ADMIN_EMAIL=you@example.com" \
  --set-secrets "AUTH_SECRET=auth-secret:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,MONGODB_URI=mongodb-uri:latest"
```

Create the four secrets first in Secret Manager. Why these flags:

- `--concurrency 2`: generating a model uses one CPU core for about half a second, so a few requests at a time is the limit.
- `--memory 1Gi`: a default Tealight shade is 385k triangles (about 19 MB STL); raise it if a mode needs more.
- `--timeout 60`: generation takes seconds; 60 s is generous. A response may be up to about 32 MB on Cloud Run.
- `--allow-unauthenticated`: the app does its own login; Cloud Run's IAM must not sit in front of it.

Map `api.example.com` to the service (Cloud Run, Manage custom domains) and add the DNS records it shows.

## 4. Frontend

Build with `VITE_API_URL=https://api.example.com` and `VITE_SITE_URL=https://example.com`. On Vercel set the project root
directory to `frontend/` and these two variables.

## Checks after deploying

1. `curl -i https://api.example.com/api/me` answers `401` with `{"error":"unauthorized"}`.
2. Signing in from the site returns to the site, and the app loads a model.
3. The built site contains no algorithm: `pnpm build` in `frontend/` runs `scripts/check-bundle.mjs` and fails otherwise.

Check Cloud Run's current free tier and pricing before relying on it once the free credit ends.
