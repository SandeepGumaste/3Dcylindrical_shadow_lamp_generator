# OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google OAuth login that gates all of `/app`, stores users in MongoDB with role `user` (or `admin` for the owner's email).

**Architecture:** Node handlers in `/api` (Vercel function shape) built on Auth.js `@auth/core` (Web `Request` in, `Response` out) with a JWT session cookie. A tiny dev server mounts the same handlers locally on port 3001; Vite proxies `/api` to it. The React app asks `/api/me` once on load and renders a sign-in screen or the app.

**Tech Stack:** TypeScript, `@auth/core`, `mongodb`, vitest, React 19, Vite 8, `tsx`, `concurrently`.

**Spec:** Approved design in chat, 2026-10-21 (no spec file). Earlier context: `docs/superpowers/specs/2026-10-19-accounts-history-and-site-design.md` on branch `docs/accounts-history-design` (stack and Auth.js choice).

## Global Constraints

- Branch is `backend`.
- Provider: Google only. Session: JWT cookie, no DB read per request.
- Role is `user` for everyone; `admin` only when the Google profile email equals `ADMIN_EMAIL` and `email_verified` is true. Compare case-insensitively. Decided at every sign-in, so changing `ADMIN_EMAIL` takes effect on next login (and demotes the old admin).
- All of `/app` requires login; both roles see all four tabs. Landing and legal pages stay public.
- `MONGODB_URI` defaults to `mongodb://127.0.0.1:27017/odd-shadows`. Switching to Atlas must be an `.env` edit only.
- `users` collection documents: `{ email, name, image, role, createdAt }`; `email` is unique (lowercased).
- No secret may reach the browser bundle: server code lives in `server/` and `api/`, never imported from `src/`.
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ADMIN_EMAIL`, `MONGODB_URI`, `AUTH_URL` (default `http://localhost:3000`). Local redirect URI: `http://localhost:3000/api/auth/callback/google`.
- Owner does all browser testing: do not use Playwright or screenshots.
- Existing `npm run lint` (tsc) and `npm test` must stay green.

## Review Focus

1. Email differs only by case from `ADMIN_EMAIL`: still admin.
2. Google profile with `email_verified: false` and the admin email: gets `user`, never `admin`.
3. Returning user: no duplicate document, `role` re-evaluated, `createdAt` unchanged.
4. Missing/invalid/expired session cookie on `/api/me`: 401 JSON, no stack or secret in body.
5. MongoDB down at sign-in: sign-in fails with an error page, never grants a session without a stored user.

## File Structure

- `server/roles.ts`: `roleFor` pure function.
- `server/users.ts`: `UserStore` interface, `upsertUser`, Mongo implementation.
- `server/db.ts`: lazy shared `MongoClient`.
- `server/auth.ts`: Auth.js config and `authHandler(req: Request): Promise<Response>`.
- `server/session.ts`: `getSessionUser(req: Request): Promise<SessionUser | null>`.
- `server/node-adapter.ts`: Node `IncomingMessage`/`ServerResponse` to Web `Request`/`Response` bridge.
- `api/auth/[...auth].ts`, `api/me.ts`: Vercel-style handlers.
- `server/dev.ts`: local server on port 3001.
- `src/auth/useSession.ts`, `src/auth/AuthGate.tsx`, `src/auth/AccountChip.tsx`: frontend.

---

### Task 1: Roles and user store

**Files:**
- Create: `server/roles.ts`, `server/users.ts`, `server/db.ts`
- Test: `server/__tests__/roles.test.ts`, `server/__tests__/users.test.ts`

**Interfaces:**
- Produces:
  - `type Role = 'user' | 'admin'`
  - `roleFor(profile: { email: string; emailVerified: boolean }, adminEmail: string | undefined): Role`
  - `interface UserRecord { email: string; name: string; image: string; role: Role; createdAt: Date }`
  - `interface UserStore { upsert(u: { email: string; name: string; image: string; role: Role }): Promise<UserRecord> }`
  - `createMongoUserStore(uri?: string): UserStore` (uses `MONGODB_URI`, default per constraints; ensures unique index on `email`)

- [ ] **Step 1: Write failing tests.** `roles.test.ts`: `roleFor({email:'Me@X.com',emailVerified:true},'me@x.com')==='admin'`; same with `emailVerified:false` is `'user'`; other email is `'user'`; `adminEmail` undefined or empty is `'user'`. `users.test.ts` with an in-memory fake store implementing `UserStore` is not enough: test `createMongoUserStore` against the local mongod using database `odd-shadows-test` (drop it in `afterAll`): upsert twice with the same email keeps one document and the original `createdAt`, and a changed `role` is updated; email is stored lowercased.
- [ ] **Step 2: Run** `npx vitest run server` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three files. `upsert` uses `findOneAndUpdate` with `$set` for name, image, role and `$setOnInsert` for `createdAt`, `upsert: true`, `returnDocument: 'after'`.
- [ ] **Step 4: Run** `npx vitest run server` — Expected: PASS (local mongod must be running; it is, pid 741).
- [ ] **Step 5: Commit** `feat: roles and mongo user store` (include `package.json`/lockfile changes from `npm i mongodb`).

### Task 2: Auth.js config, session guard, API handlers

**Files:**
- Create: `server/auth.ts`, `server/session.ts`, `server/node-adapter.ts`, `api/auth/[...auth].ts`, `api/me.ts`
- Test: `server/__tests__/session.test.ts`, `server/__tests__/authCallbacks.test.ts`

**Interfaces:**
- Consumes: `roleFor`, `UserStore` (Task 1).
- Produces:
  - `interface SessionUser { email: string; name: string; image: string; role: Role }`
  - `buildAuthConfig(store: UserStore, env: NodeJS.ProcessEnv): AuthConfig` (Google provider; `trustHost: true`; `session.strategy: 'jwt'`)
  - `getSessionUser(req: Request, env?: NodeJS.ProcessEnv): Promise<SessionUser | null>`
  - `handleMe(req: Request): Promise<Response>` returns 200 `SessionUser` JSON or 401 `{"error":"unauthorized"}`
  - `toWebRequest(req: IncomingMessage, baseUrl: string): Request` and `sendWebResponse(res: ServerResponse, r: Response): Promise<void>` in `server/node-adapter.ts`

- [ ] **Step 1: Write failing tests.** `authCallbacks.test.ts`: call `buildAuthConfig(fakeStore, env).callbacks.signIn` with a Google profile `{email, email_verified, name, picture}` and assert the fake store received role per Review Focus 1–2 and the callback returns true; when the fake store throws, `signIn` returns false (Review Focus 5). Call the `jwt` and `session` callbacks and assert the role is copied into the token and into `session.user.role`. `session.test.ts`: encode a JWT with `@auth/core/jwt` `encode` using a test `AUTH_SECRET`, put it in a `Cookie: authjs.session-token=…` header, and assert `getSessionUser` returns the user; no cookie, a garbage cookie, and a token signed with another secret all return null; `handleMe` returns 401 with body exactly `{"error":"unauthorized"}` for those (Review Focus 4).
- [ ] **Step 2: Run** `npx vitest run server` — Expected: FAIL.
- [ ] **Step 3: Implement.** Install `@auth/core`. Role and profile fields travel in the JWT; `getSessionUser` decodes with `decode` from `@auth/core/jwt` using salt equal to the cookie name. `api/auth/[...auth].ts` and `api/me.ts` export Vercel default handlers wrapping `Request`/`Response` through the adapter.
- [ ] **Step 4: Run** `npx vitest run server` and `npm run lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: google oauth, session guard and /api/me`.

### Task 3: Local dev server, proxy and env

**Files:**
- Create: `server/dev.ts`
- Modify: `vite.config.ts` (add `server.proxy` for `/api` to `http://localhost:3001`), `package.json` (scripts `dev:api` = `tsx server/dev.ts`, `dev` = run Vite and `dev:api` together with `concurrently`), `.env.example`, `tsconfig.json` (include `server`, `api`, `types: ["vite/client","node"]` if needed)
- Test: `server/__tests__/dev.test.ts`

**Interfaces:**
- Consumes: `handleMe`, `authHandler` and the adapter (Task 2).
- Produces: `createDevServer(): http.Server` routing `/api/auth/*` to the Auth.js handler and `/api/me` to `handleMe`; anything else 404 JSON.

- [ ] **Step 1: Write failing test.** Start `createDevServer()` on an ephemeral port; `GET /api/me` without a cookie returns 401 and the JSON from Task 2; `GET /api/nope` returns 404; `GET /api/auth/providers` returns 200 JSON listing `google`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/dev.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `server/dev.ts` (loads `.env` with `dotenv`, which is already a dependency; listens on 3001 only when run as the entry file). Add the Vite proxy, scripts and the five env vars plus `AUTH_URL` to `.env.example` with comments. Install `concurrently` as a devDependency.
- [ ] **Step 4: Run** `npx vitest run server` and `npm run lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: local api dev server and vite proxy`.

### Task 4: Frontend gate

**Files:**
- Create: `src/auth/useSession.ts`, `src/auth/AuthGate.tsx`, `src/auth/AccountChip.tsx`
- Modify: `src/main.tsx` (wrap `<App />` in `<AuthGate>`), `src/components/Brand.tsx` or `src/App.tsx` sidebar (render `AccountChip` near the brand)
- Test: `src/auth/__tests__/session.test.ts`

**Interfaces:**
- Produces:
  - `type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser }` with `SessionUser` redeclared as a type in `src/auth/types.ts` (no import from `server/`)
  - `fetchSession(fetchFn?: typeof fetch): Promise<SessionState>`: 200 gives `signedIn`, 401 gives `signedOut`, network error or 5xx throws
  - `useSession(): SessionState & { retry(): void }`
  - `signIn()` posts to `/api/auth/signin/google` with the CSRF token from `/api/auth/csrf` (form POST, full-page redirect); `signOut()` likewise to `/api/auth/signout`

- [ ] **Step 1: Write failing test** for `fetchSession` with an injected fake `fetch`: 200 with a user JSON gives `signedIn` with that user; 401 gives `signedOut`; a 500 and a rejected promise both reject.
- [ ] **Step 2: Run** `npx vitest run src/auth` — Expected: FAIL.
- [ ] **Step 3: Implement.** `AuthGate` shows a loading screen, then either a centered "Sign in with Google" screen in the app's slate/amber style or `children`; on fetch failure it shows an error with a Retry button (never the app). `AccountChip` shows email, role badge and a Sign out button.
- [ ] **Step 4: Run** `npm test` and `npm run lint` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: login gate and account chip in the app`.

### Task 5: Docs and handoff

**Files:**
- Modify: `ARCHITECTURE.md` (short "Accounts and API" section), create `docs/auth-setup.md` (how to create the Google OAuth client, the redirect URI, how to switch `MONGODB_URI` to Atlas, how `ADMIN_EMAIL` works)

- [ ] **Step 1: Write both docs**, matching the existing tone of `ARCHITECTURE.md`.
- [ ] **Step 2: Run** `npm run build` — Expected: build succeeds (the `/app` bundle must not contain `server/` code: `grep -r "AUTH_SECRET" dist` returns nothing).
- [ ] **Step 3: Commit** `docs: auth setup and architecture notes`.

## Self-review

- Spec coverage: gate everything (Task 4), Google + Auth.js + JWT (Task 2), roles with env admin (Tasks 1–2), local mongo default and URL swap (Task 1, 3, 5), env example (Task 3), tests (all).
- Names consistent: `SessionUser`, `roleFor`, `UserStore`, `handleMe`, `fetchSession`.
- Not covered by automation (owner tests in the browser): the real Google redirect round trip.
