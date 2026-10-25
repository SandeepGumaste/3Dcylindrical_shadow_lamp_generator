# Deploying the backend to Render (free web service)

`render.yaml` at the repo root describes the service: Node 22, root directory `backend/`, build `pnpm install && pnpm build`, start `node dist/main.js`. Render sets `PORT` itself.

## 1. Create the service
Render dashboard, New, Blueprint, pick this repo and branch. Render reads `render.yaml` and asks for the values marked `sync: false`.
Without a Blueprint: New, Web Service, root directory `backend`, the build and start commands above, and add the environment variables by hand.

## 2. Environment variables
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MONGODB_URI`: as in `backend/.env.example`.
- `ADMIN_EMAIL`: the Google email that becomes admin.
- `AUTH_URL`: the service address, `https://<service>.onrender.com`, or a custom domain.
- `FRONTEND_ORIGIN`: the site's origin.
- `ASSETS_DIR=dist/assets` is already in `render.yaml`. The build copies the STL files there, and the server does not find them without it.

## 3. Google and Atlas
- Redirect URI: `<AUTH_URL>/api/auth/callback/google`.
- Atlas Network Access: allow `0.0.0.0/0` (Render has no fixed outgoing address).

## Notes
- The free plan sleeps after about 15 minutes idle; the first request then takes about a minute. It has 512 MB RAM, which may be tight for large models.
- The login cookie is only sent when the site and API are same-site; see `deploy-cloud-run.md`, "Addresses". A `*.onrender.com` API with the site elsewhere will not keep the login.
