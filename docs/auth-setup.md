# Login setup (Google OAuth + MongoDB)

## 1. Google OAuth client
1. Google Cloud Console, APIs & Services, Credentials, Create credentials, OAuth client ID, type Web application.
2. Authorised redirect URI (local): `http://localhost:3000/api/auth/callback/google`. For production add `https://<your-domain>/api/auth/callback/google`.
3. Copy the client ID and secret.

## 2. `.env` (copy from `.env.example`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: from step 1.
- `AUTH_SECRET`: `openssl rand -base64 32`.
- `ADMIN_EMAIL`: your Google email. That verified account gets role `admin`; everyone else gets `user`. Changing it applies at the next sign-in.
- `MONGODB_URI`: leave the default for the local `mongod` (`mongodb://127.0.0.1:27017/odd-shadows`). To use Atlas, replace it with the Atlas connection string; nothing else changes.
- `AUTH_URL`: public origin (`http://localhost:3000` locally).

## 3. Run
`npm run dev` starts Vite on port 3000 and the API on port 3001 (Vite proxies `/api`). Open `http://localhost:3000/app`.

## Notes
- Users are stored in the `users` collection on first sign-in.
- On Vercel, set the same variables in the project settings. Preview deployments cannot log in because Google does not accept changing redirect URIs.
