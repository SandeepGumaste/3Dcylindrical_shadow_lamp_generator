# Server-Side Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all four generators (Tealight shade and its Bowl variant, Box shadow, Shadow wall, Light source) to a standalone Node backend so the shipped frontend contains no algorithm, with the repo split into `frontend/` and `backend/`.

**Architecture:** Characterize today's output first (golden values), carve the plain data (param types, defaults, ranges, output shapes) into `contracts/`, split the repo with `git mv`, then add one authenticated `POST /api/generate` endpoint on the backend (stateless, rate limited, CORS for the frontend origin) and replace the frontend's workers with a small API client. Cookies need no domain setting: `app.<domain>` and `api.<domain>` are same-site, so the host-only session cookie set by the API is sent on credentialed fetches.

**Tech Stack:** TypeScript, Node (http + Web Request/Response, as already built on `backend`), `@auth/core`, MongoDB, vitest, React 19 + Vite 8 (frontend), esbuild + Docker (Cloud Run), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-22-server-side-generation-design.md` (base the work on branch `backend`; create `feat/server-generation` from it).

## Global Constraints

- Frontend bundle contains none of: geometry, shadow solver, image sampling, STL/SVG writers, kit STL data. `frontend/` never imports from `backend/` source, and vice versa.
- Same output for the same grayscale image and settings: golden triangle counts and watertight flags, per mode, must not change.
- All four modes move; the unreachable cylinder mode is deleted, not moved.
- Every `/api/generate` request needs a valid session (401 otherwise) and counts against 60 requests per 10 minutes per user (429 `Too many requests, try again in a few minutes`). Max request body 3 MB.
- Server is stateless; a download repeats the request with `output` set to `stl`, `svg`, `zip` or `{part}`.
- Interaction rules unchanged: generate on image change and Generate; settings edits only mark the model out of date; a download uses the settings and image of the last Generate.
- Browser sends the 512 x 512 grayscale image with neutral adjustments (what `loadImageToGray(..., adjustments: NEUTRAL)` returns today) as **raw Float32 little-endian, base64** (exact, so parity holds; about 1.4 MB). Bundled images go as `{kind:'bundled', id}`.
- Cloud Run: concurrency 2 per instance, response under about 32 MB, `PORT` env, stateless.
- Login, roles and `users` collection from branch `backend` keep working; Google redirect URI becomes `<API origin>/api/auth/callback/google`.
- Owner does all browser testing: no Playwright or screenshots. Use pnpm (not npm) in each package.
- Env vars (backend): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ADMIN_EMAIL`, `MONGODB_URI`, `AUTH_URL` (API origin), `FRONTEND_ORIGIN`. Frontend: `VITE_API_URL` (default `http://localhost:3001`).

## Review Focus

1. Float32 image round trip: the image decoded on the server reproduces exactly the pixels the browser had (pinned by Task 4 parity test).
2. Garbage requests: not JSON, wrong pixel byte length, NaN or huge numbers, unknown params, body over 3 MB. Expect 400/413/422 JSON with no stack trace, and the server keeps serving.
3. Expired or missing session mid-use: frontend shows the sign-in screen, not a generic error.
4. Two quick Generate presses, or an image change while loading: only the newest response is applied and the older request is aborted.
5. Download after editing settings: it uses the snapshot of the last Generate, not the current form values.
6. CORS: a request from an origin other than `FRONTEND_ORIGIN` gets no allow headers; preflight for `POST` with JSON and credentials succeeds for the allowed origin.

## File Structure (after Task 3)

```
backend/
  src/contracts/            plain types, defaults, ranges, wire types (source of truth)
  src/geometry, shadow/     moved algorithm code (+ image/sampling.ts, tealightSamples.ts)
  src/compute/              moved *Compute.ts files (pure run*Request functions)
  src/generate/             request parsing, service, response framing
  src/server/               auth, session, me, rate limit, cors, routes, main
  assets/                   box-kit/*.stl, light-source/*.stl, images/*
  Dockerfile, package.json, tsconfig.json
frontend/
  src/contracts/            generated copy (scripts/sync-contracts.mjs), never edited by hand
  src/api/                  client, frame decoding, errors
  src/image/                loadImage.ts, grayscale.ts (browser canvas, stays)
  (all web files: app, site, legal, privacy, terms, faq, public, vite-plugins, vercel.json)
scripts/sync-contracts.mjs  copies backend/src/contracts to frontend/src/contracts (--check fails on drift)
```

---

### Task 1: Golden characterization

**Files:**
- Create: `src/__golden__/golden.test.ts`, `src/__golden__/golden.json` (moves with the code in Task 3)

**Interfaces:**
- Produces: `golden.json` keyed `tealight-default`, `tealight-ribs`, `bowl-default`, `box-default`, `wall-default`, `wall-nondefault`, `light-default`, each `{ triangleCount: number, watertight: boolean }` (box also `parts: number`); a helper `syntheticImage(): GrayImage` (512 x 512 checker-in-disc used by the Task-0 timing run, `Float32Array` pixels) exported from the test folder for reuse by Task 4.

- [ ] **Step 1: Write the test.** For each key, run the existing pure compute (`runTealightRequest`, `runShadowWallRequest`, `runBoxRequest` with a loader reading `public/box-kit/*.stl` from disk, `buildBracket` with `public/light-source/wiring-bracket-100.stl`) on `syntheticImage()` with default params, plus `tealight-ribs` (`autoRibs: true`) and `wall-nondefault` (any one changed setting). Assert equality with `golden.json`; when env `UPDATE_GOLDEN=1`, write the file instead.
- [ ] **Step 2: Run** `UPDATE_GOLDEN=1 npx vitest run src/__golden__` then `npx vitest run src/__golden__`. Expected: first writes the file, second PASS. Read `golden.json`: every `watertight` is true for default cases.
- [ ] **Step 3: Commit** `test: golden characterization of all generators`.

### Task 2: Extract contracts in place

**Files:**
- Create: `src/contracts/tealight.ts`, `bowl.ts`, `box.ts`, `shadowWall.ts`, `lightSource.ts`, `outputs.ts`, `api.ts`
- Modify: the algorithm modules (`src/geometry/tealightShade.ts`, `shadowBowl.ts`, `box/rimProfile.ts`, `box/kitSpec.ts`, `shadowWall/shadowWall.ts`, `shadowWall/limits.ts`, `lightSource/bracket.ts`) and `src/workers/*Compute.ts` to import and re-export from contracts; the UI files that import those symbols keep working through the re-exports until Task 6.

**Interfaces:**
- Produces (all pure data and types, no algorithm, no imports from outside `contracts/`):
  - `contracts/tealight.ts`: `TealightParams`, `DEFAULT_TEALIGHT_PARAMS`, `LED_CLEARANCE`
  - `contracts/bowl.ts`: `BowlParams`, `DEFAULT_BOWL_PARAMS`
  - `contracts/box.ts`: `BoxParams`, `DEFAULT_BOX_PARAMS`, `KIT_UI = { boxW, boxD, lightHeightRange }` (only what `BoxPanel` reads from `KIT`)
  - `contracts/shadowWall.ts`: `ShadowWallParams`, `DEFAULT_SHADOW_WALL_PARAMS`, `cornerRadiusLimits(p: Pick<ShadowWallParams,'width'|'length'|'wallThickness'>): {min:number; max:number}`
  - `contracts/lightSource.ts`: `BracketParams`, `DEFAULT_HEIGHT`, `MIN_HEIGHT`, `MAX_HEIGHT`
  - `contracts/outputs.ts`: result metadata types without typed arrays, STL or zip: `MeshCheck`, `FieldReport`, `ShadowComparison`, `RibSuggestion`, `TealightMeta`, `WallMeta`, `BoxMeta` (parts `{id,label,generated}[]`, `light`, `warnings`, `clamped`, `ms`), `LightMeta`, and `GrayImage`
  - `contracts/api.ts`: `type Mode = 'tealight' | 'bowl' | 'box' | 'wall' | 'light'`; `type Output = 'preview' | 'stl' | 'svg' | 'zip' | { part: string }`; `type ImageRef = { kind: 'bundled'; id: string } | { kind: 'gray'; width: 512; height: 512; pixels: string }` (base64 raw Float32 LE); `interface GenerateRequest { mode: Mode; image?: ImageRef; params: Record<string, unknown>; output: Output; fit?: boolean }` (`image` omitted for `light`); `interface ApiErrorBody { error: string; errors?: string[] }`; `const MAX_BODY_BYTES = 3_000_000`

- [ ] **Step 1: Write failing test** `src/contracts/__tests__/contracts.test.ts`: every file in `src/contracts` has no import path outside `./` (read the files, assert none matches `from '\.\./`); `DEFAULT_TEALIGHT_PARAMS` deep-equals the value the algorithm module exports; `cornerRadiusLimits({width:100,length:60,wallThickness:2})` equals `{min:4,max:30}`; `KIT_UI.boxW` and `KIT_UI.boxD` equal `KIT.boxW` and `KIT.boxD`.
- [ ] **Step 2: Run** `npx vitest run src/contracts` — Expected: FAIL (files missing).
- [ ] **Step 3: Move** each type, default and constant out of the algorithm module into the matching contract file and import it back (re-export so existing imports resolve). No logic changes.
- [ ] **Step 4: Run** `npx vitest run` and `npm run lint` — Expected: all PASS, including Task 1 golden (unchanged values).
- [ ] **Step 5: Commit** `refactor: extract contracts (types, defaults, ranges, wire types)`.

### Task 3: Remove cylinder mode and split the repo

**Files:**
- Delete: cylinder-only code (`cylinder` branch in `src/App.tsx`, `ControlsPanel.tsx`, `ShadowPreview.tsx`, `ThreeViewport.tsx` if only the cylinder uses it, `src/workers/lampRunner.ts`, `generateLamp.worker.ts`, `src/geometry/cylinder.ts`, `ray.ts`/`outline.ts` only if unused after, their tests such as `cylinderSnapshot.test.ts`); use `tsc` to find leftovers
- Move (`git mv`): web files to `frontend/` (`src/` UI, `app/`, `site/`, `legal/`, `privacy/`, `terms/`, `faq/`, `public/` minus STL folders, `index.html`, `vite-plugins/`, `vite.config.ts`, `vercel.json`, `scripts/make-og.mjs`); `src/geometry`, `src/shadow`, `src/image/sampling.ts`, `src/image/tealightSamples.ts`, `src/workers/*Compute.ts` and their tests, `src/contracts`, `src/__golden__`, `server/*` and `api/*` logic, `public/box-kit`, `public/light-source` to `backend/`; bundled images copied (not moved) into `backend/assets/images/`
- Create: `backend/package.json`, `backend/tsconfig.json`, `frontend/package.json`, `frontend/tsconfig.json` (each with its own lockfile via pnpm), `scripts/sync-contracts.mjs`, `frontend/src/contracts/` (generated)
- Delete: `api/` Vercel handlers; `server/dev.ts` becomes `backend/src/server/main.ts` (Task 5)

**Interfaces:**
- Produces: `node scripts/sync-contracts.mjs` copies `backend/src/contracts/*` to `frontend/src/contracts/*` with a "generated, do not edit" header; `node scripts/sync-contracts.mjs --check` exits 1 and names the file when the two differ. Root scripts: none required; each package has `test`, `lint` (tsc), `build`.

- [ ] **Step 1: Write failing test** `backend/src/contracts/__tests__/sync.test.ts`: running the sync script's `--check` through `child_process` exits 0 on a clean tree and exits 1 after one character of `frontend/src/contracts/api.ts` is changed in a temp copy.
- [ ] **Step 2: Run** it — Expected: FAIL (script missing).
- [ ] **Step 3: Do the move** with `git mv` in this order: delete cylinder code, move web files, move algorithm files, write both packages (`@auth/core`, `mongodb`, `dotenv`, `tsx`, `esbuild`, `vitest` in backend; React, Vite, three, etc. in frontend; remove `express`, `@google/genai` if still present), write the sync script and run it. Fix import paths until both packages pass `lint` and `test`. The frontend still contains a temporary compile path for the old runners: keep `frontend` building by leaving the old runner/hook files untouched until Task 6 only if they no longer import moved modules; otherwise temporarily stub with `throw new Error('moved to backend')` and note it in the ledger.
- [ ] **Step 4: Run** in `backend/`: `pnpm test` and `pnpm lint`; in `frontend/`: `pnpm lint`. Expected: backend PASS including golden and sync tests; frontend lint PASS (frontend tests that exercised moved code move with it or are rewritten in Task 6).
- [ ] **Step 5: Commit** `refactor: split repo into frontend/ and backend/`.

### Task 4: Generate service (pure, no HTTP)

**Files:**
- Create: `backend/src/generate/request.ts`, `service.ts`, `frame.ts`, `assets.ts`
- Test: `backend/src/generate/__tests__/request.test.ts`, `service.test.ts`, `frame.test.ts`

**Interfaces:**
- Consumes: contracts (Task 2), the moved `run*Request` compute functions, `validate*Params` and `fitShadowSize` functions.
- Produces:
  - `parseRequest(raw: unknown): { ok: true; req: ParsedRequest } | { ok: false; status: 400 | 422; errors: string[] }`: shape checks, `pixels` base64 length must equal `512*512*4` bytes, finite numbers only, params merged over the mode's defaults with unknown keys dropped, then the mode's `validate*Params` run (422 with its messages)
  - `decodeGray(b64: string): GrayImage` and `encodeGray(img: GrayImage): string`
  - `loadBundled(id: string): GrayImage` and `loadKitPart: PartLoader` in `assets.ts` (read from `backend/assets`)
  - `generate(req: ParsedRequest): Promise<GenerateResult>` where `GenerateResult = { kind: 'framed'; meta: object; positions: Float32Array; indices: Uint32Array } | { kind: 'file'; body: ArrayBuffer | string; contentType: string; filename: string }`; for `fit: true` on `box` and `wall`, run `fitShadowSize` first, apply it, and include it as `meta.fit`
  - `frameResponse(meta: object, positions: Float32Array, indices: Uint32Array): ArrayBuffer`: `[u32 LE length of JSON][JSON utf8][positions raw][indices raw]` with `meta.positionsBytes` and `meta.indicesBytes` added
  - `unframeResponse(buf: ArrayBuffer): { meta: any; positions: Float32Array; indices: Uint32Array }` (the frontend gets its own copy in Task 6; this one is for tests)

- [ ] **Step 1: Write failing tests.** `request.test.ts`: `decodeGray(encodeGray(img))` equals `img.pixels` exactly for `syntheticImage()` (Review Focus 1); pixels of the wrong byte length give `{ok:false,status:400}`; `NaN` and `Infinity` params give 400; an unknown param is dropped and a missing one filled from the default; an invalid setting (for example Tealight `height: -5`) gives 422 with the validator's message. `service.test.ts`: for each key in `golden.json`, `generate` through `encodeGray`/`parseRequest` returns a `triangleCount` (from `meta` or `indices.length / 3`) and watertight flag equal to the golden values (the parity guarantee); `output: 'stl'` returns a binary STL whose triangle count (bytes 80..84) equals the golden; `output: 'svg'` for Tealight returns text starting with `<svg`; Box `output: 'zip'` returns a ZIP (starts `PK`) and `{part: 'tray-2aa'}`-style ids return that part's STL; `fit: true` on `wall` returns `meta.fit` and changes `shadowSize` only when it differs. `frame.test.ts`: `unframeResponse(frameResponse(m, p, i))` returns equal `m`, `p`, `i`.
- [ ] **Step 2: Run** `pnpm test generate` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the files above. Per mode, compute via the existing `run*Request` functions; `light` uses `buildBracket` on the sample STL. Never include the typed arrays or STL inside `meta`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm lint` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): generate service, request parsing and response framing`.

### Task 5: HTTP layer, rate limit, CORS, standalone server

**Files:**
- Create: `backend/src/server/rateLimit.ts`, `cors.ts`, `routes.ts`, `main.ts`
- Modify: `backend/src/server/auth.ts` (redirect callback allows only `FRONTEND_ORIGIN`; `trustHost` stays), `node-adapter.ts` as needed
- Test: `backend/src/server/__tests__/rateLimit.test.ts`, `routes.test.ts`, `cors.test.ts`

**Interfaces:**
- Consumes: `generate`, `parseRequest`, `frameResponse` (Task 4), `getSessionUser`, `getClient`.
- Produces:
  - `createRateLimiter(opts: { limit: number; windowMs: number; uri?: string; now?: () => number }): { hit(email: string): Promise<{ ok: boolean; retryAfterSec: number }> }` (collection `rateLimits`, fixed window buckets, atomic `findOneAndUpdate` with `$inc` and TTL index)
  - `handleGenerate(req: Request, deps: { limiter; env }): Promise<Response>`: 401 `{"error":"unauthorized"}` without session; 413 over `MAX_BODY_BYTES`; 400/422 from `parseRequest` (`ApiErrorBody`); 429 with `Retry-After` and `{"error":"Too many requests, try again in a few minutes"}`; 200 framed (`application/octet-stream`) for preview or the file response (`Content-Type`, `Content-Disposition: attachment; filename=...`, `Cache-Control: no-store`); unexpected errors 500 `{"error":"generation failed"}` with the stack only in server logs
  - `withCors(handler: (r: Request) => Promise<Response>, allowedOrigin: string)`: `OPTIONS` preflight answered 204 with `Access-Control-Allow-Origin: <origin>`, `Allow-Credentials: true`, `Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: content-type`, `Expose-Headers: content-disposition`, only when `Origin` equals `allowedOrigin`; otherwise no CORS headers
  - `createServer(): http.Server` routing `/api/auth/*`, `/api/me`, `POST /api/generate`; `main.ts` listens on `PORT` (default 3001), reads `.env` with `dotenv`, handles SIGTERM

- [ ] **Step 1: Write failing tests.** `rateLimit.test.ts` (real local mongod, database `odd-shadows-test`): with `limit: 3`, 3 `hit`s are ok and the 4th returns `{ok:false}` with `retryAfterSec > 0`; 20 concurrent `hit`s with `limit: 5` yield exactly 5 ok; a hit after `now` advances past the window is ok again. `routes.test.ts` (fake limiter, test secret, encoded JWT cookie as in the session tests): no cookie gives 401; a valid cookie with a valid Tealight request gives 200 whose `unframeResponse` meta matches the golden count; a body over 3 MB gives 413; a not-JSON body gives 400; a limiter returning `{ok:false}` gives 429 with `Retry-After`; a thrown error in `generate` gives 500 with body exactly `{"error":"generation failed"}` (Review Focus 2). `cors.test.ts`: preflight from the allowed origin gives 204 with the allow headers and credentials; from another origin gives no `Access-Control-Allow-Origin` (Review Focus 6); a normal `POST` response from the allowed origin carries the headers.
- [ ] **Step 2: Run** `pnpm test server` — Expected: FAIL.
- [ ] **Step 3: Implement.** One rate-limit check per request after authentication and before parsing the body.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`; smoke: `AUTH_SECRET=x pnpm exec tsx src/server/main.ts` and `curl -i localhost:3001/api/me` gives 401 JSON — Expected: PASS and 401.
- [ ] **Step 5: Commit** `feat(backend): authenticated generate endpoint, rate limit, CORS, standalone server`.

### Task 6: Frontend API client; Tealight and Bowl through the server

**Files:**
- Create: `frontend/src/api/client.ts`, `frame.ts`, `errors.ts`
- Modify: `frontend/src/auth/session.ts` (use `${API_URL}` and `credentials: 'include'` for `/api/me`, `/api/auth/csrf`, form posts), `frontend/src/hooks/useTealightGenerator.ts`, `frontend/src/components/TealightPanel.tsx`, `TableInset.tsx`, guided components as needed, `frontend/vite.config.ts` (drop the `/api` proxy)
- Delete: `frontend/src/workers/tealightRunner.ts`, `tealight.worker.ts` and their imports
- Test: `frontend/src/api/__tests__/client.test.ts`, `frontend/src/hooks/__tests__/useTealight.test.ts`

**Interfaces:**
- Consumes: contracts copy, wire format from Task 4/5.
- Produces:
  - `const API_URL: string` (from `import.meta.env.VITE_API_URL`, default `http://localhost:3001`)
  - `class ApiError extends Error { status: number; errors?: string[] }`
  - `unframeResponse(buf: ArrayBuffer): { meta: any; positions: Float32Array; indices: Uint32Array }`
  - `generate(req: GenerateRequest, signal?: AbortSignal): Promise<{ meta: any; positions: Float32Array; indices: Uint32Array }>` and `download(req: GenerateRequest): Promise<{ blob: Blob; filename: string }>`; both send `credentials: 'include'`, JSON body, map 401 to `ApiError(401)` and surface the server's `errors`/`error`
  - `encodeGray(img: GrayImage): string` (browser-safe base64 of the Float32 buffer)
  - Hook state rule: a request counter; a response whose counter is not the latest is dropped and the previous request is aborted; a 401 sets the session to signed out

- [ ] **Step 1: Write failing tests.** `client.test.ts` with an injected `fetch`: `unframeResponse` round-trips a buffer built by hand in the documented layout; a 401 body rejects with `ApiError` `status 401`; a 422 body `{error, errors:['a','b']}` rejects with `errors` equal to `['a','b']`; `download` returns the blob and the filename from `Content-Disposition`; `encodeGray` of a known `Float32Array([0.25, 0.5])` equals the known base64. `useTealight.test.ts` (fake `generate` and `download`): calling `generateNow` twice quickly applies only the second response (Review Focus 4); after editing a setting, `download('stl')` sends the params of the last Generate, not the edited ones (Review Focus 5); a 401 makes the session callback fire; a 429 sets a visible `runError` of the server's message.
- [ ] **Step 2: Run** `pnpm test api hooks` in `frontend/` — Expected: FAIL.
- [ ] **Step 3: Implement** the client, rewrite `useTealightGenerator` to call `generate`/`download` (bundled images sent as ids; uploads through `loadImageToGray` with neutral adjustments then `encodeGray`; keep the existing out-of-date rules, loading flag and viewport inputs), and keep Bowl as `mode: 'bowl'` of the same hook. Remove imports of anything outside `contracts/`, `image/loadImage`, and the viewport.
- [ ] **Step 4: Run** `pnpm test` and `pnpm lint` in `frontend/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): server-side generation for Tealight and Bowl`.

### Task 7: Box, Shadow wall and Light source through the server

**Files:**
- Modify: `frontend/src/hooks/useBoxGenerator.ts`, `useShadowWallGenerator.ts`, `useLightSourceGenerator.ts`, `BoxPanel.tsx`, `ShadowWallPanel.tsx`, `LightSourcePanel.tsx`, `BoxViewport.tsx` inputs as needed
- Delete: `frontend/src/workers/boxRunner.ts`, `box.worker.ts`, `shadowWallRunner.ts`, `shadowWall.worker.ts`
- Test: `frontend/src/hooks/__tests__/useBox.test.ts`, `useShadowWall.test.ts`, `useLightSource.test.ts` (rewrite of the existing hook tests against a fake client)

**Interfaces:**
- Consumes: Task 6 client; `fit: true` responses carry `meta.fit` (the object `fitShadowSize` returns today).
- Produces: each hook keeps its current public controller shape (`params`, `errors`, `result`, `busy`, `runError`, `download*`) so panels change minimally; Box downloads call `download({mode:'box', output:'zip'})` and per-part downloads `output:{part:id}`; Wall and Box send `fit: true` when the image changes and from the Fit button and apply `meta.fit`; Light source sends no image.

- [ ] **Step 1: Write failing tests** per hook with a fake client: image change triggers one `generate` with `fit: true` and applies the returned fitted size; a settings edit sends no request and sets the out-of-date flag; Box zip and part downloads send the right `output`; Light source `generate` carries no `image`; a 422 shows the server's messages in `errors` and keeps the previous model.
- [ ] **Step 2: Run** `pnpm test hooks` — Expected: FAIL.
- [ ] **Step 3: Implement** the three hooks on the Task 6 client, reading ranges and defaults only from `contracts/`.
- [ ] **Step 4: Run** `pnpm test` and `pnpm lint` in `frontend/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): server-side generation for Box, Shadow wall and Light source`.

### Task 8: Boundary and bundle checks

**Files:**
- Create: `frontend/src/__tests__/boundary.test.ts`, `frontend/scripts/check-bundle.mjs`
- Modify: `frontend/package.json` (`build` runs `vite build && node scripts/check-bundle.mjs`; `sourcemap` stays off)

**Interfaces:**
- Produces: `boundary.test.ts` fails if any file under `frontend/src` or `frontend/site` imports a path containing `backend` or `../geometry`, `../shadow`, `/compute/`; `check-bundle.mjs` reads every `.js` in `frontend/dist`, fails (exit 1, naming the sentinel and file) if any sentinel from a hand-made list appears: at least 15 exported function names from `backend/src/geometry` and `shadow` (for example `generateTealightShade`, `suggestRibs`, `compareShadow`, `generateShadowWall`, `fitShadowSize`, `buildKit`, `buildBracket`, `extractSmoothLoops`), and the kit file names `tray-2aa`, `wall-hook`, `wiring-bracket-100`; it also fails when any `*.map` or `*.stl` exists in `dist`.

- [ ] **Step 1: Write failing tests.** `boundary.test.ts` as above; a self-test that `check-bundle.mjs` exits 1 on a temp dist containing `generateTealightShade` and exits 0 on a clean one.
- [ ] **Step 2: Run** `pnpm test boundary` in `frontend/` — Expected: FAIL.
- [ ] **Step 3: Implement** both; fix any leftover import they find.
- [ ] **Step 4: Run** `VITE_SITE_URL=https://example.com pnpm build` in `frontend/` — Expected: build succeeds and the bundle check passes. Also run the check against the old tree is not needed.
- [ ] **Step 5: Commit** `test: frontend boundary and bundle sentinel checks`.

### Task 9: Container, Cloud Run, env, docs

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `backend/.env.example`, `frontend/.env.example`, `docs/deploy-cloud-run.md`
- Modify: `ARCHITECTURE.md`, `docs/auth-setup.md` (redirect URI and ports)

**Interfaces:**
- Produces: `pnpm build` in `backend/` bundles `src/server/main.ts` with esbuild to `dist/main.js` (assets copied to `dist/assets`); the image runs `node dist/main.js` as non-root, honours `PORT`; docs give the `gcloud run deploy` flags (`--concurrency 2`, `--cpu 1`, `--memory 1Gi`, `--timeout 60`, `--allow-unauthenticated`, the env vars from Global Constraints with `MONGODB_URI` from Atlas), the Atlas "allow from anywhere" note, the custom domain mapping `api.<domain>`, the frontend's `VITE_API_URL`, and the Google redirect URI for local (`http://localhost:3001/api/auth/callback/google`) and production.

- [ ] **Step 1: Write failing test** `backend/src/server/__tests__/build.test.ts`: after `pnpm build`, `node dist/main.js` started with `PORT=0`-style ephemeral port and `AUTH_SECRET` answers `GET /api/me` with 401 and a `POST /api/generate` without a cookie with 401 (spawn it, poll for readiness, kill it).
- [ ] **Step 2: Run** it — Expected: FAIL (no build script).
- [ ] **Step 3: Implement** the build script, Dockerfile (multi-stage, `node:22-slim`, `pnpm install --frozen-lockfile --prod` in the final stage), env examples and docs. If Docker is installed, `docker build backend` must succeed; if not, say so in the ledger.
- [ ] **Step 4: Run** `pnpm test` and `pnpm lint` in both packages — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: Cloud Run container, env examples and deploy docs`.

## Self-review

- Spec coverage: server-side generation for all four modes (Tasks 4 to 7), login and 401 (Task 5), frontend bundle without algorithm and sentinel test (Task 8), golden parity (Tasks 1 and 4), repo split (Task 3), Cloud Run, CORS and cookies (Tasks 5 and 9), rate limit (Task 5), out-of-date and snapshot download (Tasks 6 and 7), stateless downloads (Task 4), cylinder removal (Task 3), docs (Task 9).
- Deviations from the spec, to ledger as rulings: the grayscale image is sent as raw Float32 (about 1.4 MB base64) rather than the spec's 260 KB estimate, because 8-bit quantization would not reproduce today's triangle counts; the request limit is therefore 3 MB, not 2 MB. Cookies need no `Domain` attribute because the two hosts are same-site.
- Names consistent: `GenerateRequest`, `Mode`, `Output`, `ImageRef`, `frameResponse`/`unframeResponse`, `createRateLimiter`, `handleGenerate`, `withCors`, `ApiError`.
- Not covered by automation (owner tests in the browser): the real Google round trip across the two hosts, the Cloud Run deploy itself, loading behaviour and timing on a real network.
