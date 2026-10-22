# Login setup (Google OAuth + MongoDB)

The login lives in the backend (`backend/`). The frontend only asks `GET /api/me` and starts sign-in on the backend's address.

## 1. Google OAuth client
1. Google Cloud Console, APIs & Services, Credentials, Create credentials, OAuth client ID, type Web application.
2. Authorised redirect URI (local): `http://localhost:3001/api/auth/callback/google`. For production add `https://<api address>/api/auth/callback/google`.
3. Copy the client ID and secret.

## 2. `backend/.env` (copy from `backend/.env.example`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: from step 1.
- `AUTH_SECRET`: `openssl rand -base64 32`.
- `ADMIN_EMAIL`: your Google email. That verified account gets role `admin`; everyone else gets `user`. It is re-checked on every request, so changing it takes effect at once.
- `MONGODB_URI`: leave the default for the local `mongod` (`mongodb://127.0.0.1:27017/odd-shadows`). To use Atlas, replace it with the Atlas connection string; nothing else changes.
- `AUTH_URL`: the API's own origin (`http://localhost:3001` locally).
- `FRONTEND_ORIGIN`: the site's origin (`http://localhost:3000` locally). It is the only origin allowed to call the API with credentials, and the only place sign-in and sign-out send people back to.

## 3. Run
In two terminals: `pnpm dev` in `backend/` (API on port 3001) and `pnpm dev` in `frontend/` (site on port 3000, calls the API at `VITE_API_URL`, default `http://localhost:3001`). Open `http://localhost:3000/app`. Cookies are not port-specific, so the two ports share the login.

## Notes
- Users are stored in the `users` collection on first sign-in.
- Production deployment: see `docs/deploy-cloud-run.md`.
