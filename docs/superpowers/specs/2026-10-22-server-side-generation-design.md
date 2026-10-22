# Server-side model generation: design

Date: 2026-10-22. Status: draft for approval. Builds on branch `backend` (Google login, MongoDB users, Node handlers), which is not merged yet.

## Intent and why

Today the whole generator (image processing, geometry, shadow solver, STL and SVG writers) runs in the visitor's browser, so anyone can read it in the shipped JavaScript and copy it. The owner wants the algorithm to exist only on a server. Visitors get the user interface and the finished model, never the code that makes it.

## What is being built

1. A **backend** that runs all generation for all four modes (Tealight shade, Box shadow, Shadow wall, Light source) and returns the result.
2. A **frontend** that contains only the interface: settings, image choice, the 3D viewport, the loading state, the buttons.
3. A **repository split** into `frontend/` and `backend/`, each buildable and hostable on its own.

## How it behaves

- Using the app already requires login (done on `backend`). Every generation request also requires a valid session; without one the server answers 401.
- Someone picks a bundled image or uploads their own, then presses **Generate** (the first model also generates automatically when an image is chosen, as today). The page shows a loading state until the server answers, then shows the model in the viewport exactly as now.
- Changing a setting after a model exists shows the existing out-of-date notice. It does not call the server. The server runs again only on Generate or when the image changes. This keeps today's interaction rules (owner's call, see below).
- **Download STL** and **Download SVG** give the server's output for the settings shown. A download never sends a model that is out of date for the settings on screen.
- Errors (validation failure, server busy, timeout, network) show a clear message in the panel and leave the previous model in place.
- Generation takes about 0.5 s of one CPU core for a default Tealight shade (measured in Node: 385k triangles, 19.3 MB STL, 6.9 MB of preview mesh data). The loading state is expected to last a few seconds including network time.

## Goals

- The production frontend bundle contains none of the algorithm: no geometry, shadow-solver, image-processing, or STL/SVG writing code, and none of the bundled kit data. A test fails the build if `frontend/` imports from `backend/` or if the built bundle contains a list of sentinel identifiers taken from the algorithm code.
- Results are identical to today's for the same inputs (same triangle counts and the same watertight check), proven by tests that run the moved code unchanged.
- `frontend/` and `backend/` have separate `package.json`, lockfile, build and deploy; neither imports the other's source.
- Login, roles and the `users` collection keep working as built on `backend`.

## Non-goals

- Hiding the output. Anyone logged in can download the models they generate; that is the product.
- Live (per-slider) regeneration, queues, accounts history, payments, or an admin console.
- Changing what the generator produces or how it looks.
- Offline use of the app.

## Anti-goals (a failure even if it technically works)

- Any algorithm file, or a source map that reveals one, reachable from the frontend host.
- A generation endpoint reachable without login, or one a single user can call without limit.
- Different geometry than today for the same image and settings.
- The login cookie not reaching the API once the two halves are on different hosts.

## Constraints and decisions (owner's unless marked)

- **Hosting:** the backend on **Google Cloud Run** (owner has the free credit). The frontend is hosted separately (Vercel today); the owner decides later. Both halves must work on their own.
- **Custom domain:** the owner will buy one. Frontend on the apex or `www`, the API on `api.<domain>`, so the session cookie is shared with `Domain=.<domain>`. Until the domain exists, local development uses `localhost` (cookies are not port-specific, so two ports work).
- **Cloud Run limits:** one response may be up to about 32 MB (the 19 MB STL fits). Instances are stateless and may be many, so the server keeps no result in memory between requests.
- **Database:** MongoDB Atlas (the local MongoDB is unreachable from Cloud Run). The owner supplies the URL; until then the local one is used in development. Cloud Run has no fixed outgoing address, so Atlas accepts connections from anywhere, protected by its user and password.
- **Everything moves** in this pass, all four modes (owner said yes to the scope; this is my reading of an ambiguous "yes").
- **Interaction rules unchanged** (my call): generate on image change and on Generate, out-of-date notice otherwise.
- **Roles:** both `user` and `admin` can generate (as today both see all tabs).

## My calls (the owner can overturn these)

- **Image decoding stays in the browser** so results stay exactly the same: the browser already turns any upload (including SVG) into the 512 x 512 grayscale image with neutral adjustments (`loadImageToGray` with neutral settings; this is generic canvas work, not the algorithm). It sends that grayscale image with the settings as raw 32-bit floats (about 1.4 MB encoded), because 8-bit rounding would not reproduce today's triangle counts. Everything that depends on the settings, including invert, brightness, contrast, gamma, threshold, rotation and flip, runs on the server. No server-side image decoder, SVG rasteriser or XXE exposure is needed. Bundled images are sent as an id (the server holds the full copies; the frontend keeps small thumbnails only). Maximum request size: 3 MB.
- **"Same results" means the same output for the same 512 px grayscale image and settings**, proven by running the moved code unchanged against golden values taken before the move (triangle counts and the watertight check for each mode's default and one non-default setting).
- **Outputs per mode** (STL, SVG, and the Box mode zip) are all produced by the server. The builder first measures time, triangle count and response size for each of the four modes and reports any that exceed the Cloud Run limits (about 32 MB per response, the request timeout) before building further.
- **The live helper views** are not live today and nothing is lost: `ShadowPreview` is only used by the unreachable cylinder mode (removed with it), `TableInset` only draws the comparison data already inside the generation result, and the guided steps are switched off. They are fed from the last server result.
- **Settings limits:** the first check of derived limits (for example a minimum height) is the server's. A round trip of a few seconds before an error is accepted. Plain min/max ranges stay in the frontend.
- **Rate limit:** every generation and every download request counts as one request; 60 per 10 minutes per user, kept atomically in MongoDB. Going over shows "Too many requests, try again in a few minutes" (HTTP 429). No quota counter in the UI.
- **Out-of-date downloads:** the frontend stores the settings used for the last Generate and downloads with exactly those settings (and the image from that Generate), so a download always matches the model on screen.
- **Repository split:** all web files (the app, `site/`, `legal/`, `privacy/`, `terms/`, `faq/`, `public/`, the Vite plugins, `vercel.json`) move into `frontend/`; `server/` and `api/` from the `backend` branch fold into `backend/`, which becomes a standalone Node server (no Vercel handlers). Files move with `git mv` so history is kept. The Vercel project's root directory becomes `frontend/`. This work is part of the same single go-live as login and the static site.
- **Sentinel check:** the frontend build is minified with source maps off. The sentinel list is hand-curated from exported names, string literals and kit data names in the algorithm code; the test fails the build if any appears in the output.
- The server is **stateless**: a download repeats the request (same image and settings) and returns the STL or SVG. It costs about half a second again and needs no storage.
- The legacy "cylinder" lamp mode is not reachable from the UI today. It is removed from the frontend rather than moved.
- A **per-user rate limit** (for example 30 generations per 10 minutes, kept in MongoDB) limits both cost and attempts to learn the algorithm by sweeping inputs. Cloud Run is set to a small per-instance concurrency (about 2) because generation is CPU-bound.
- Defaults, labels and plain min/max ranges for settings may live in the frontend as data. Any rule that encodes geometry (for example a derived minimum height) lives on the server and comes back as an error message.

## Left to the builder

- The request and response shapes, binary encoding of the preview mesh, compression, and how Download repeats a request.
- Content checks on the uploaded grayscale image (dimensions, value range) and its encoding on the wire.
- Which UI helpers currently import algorithm modules (panels, `TableInset`, `ShadowPreview`, guided steps) and how each is fed from server data instead. The imports to cut are listed by `grep` of `src/components`, `src/hooks`, `src/App.tsx` and `src/ui` for `geometry`, `shadow`, `image` and `workers`.
- Repository layout details, the Dockerfile and Cloud Run settings, CORS with credentials, the cookie domain setting, CSRF for cross-origin form posts, and the CI sentinel test.
- Moving or replacing the `api/` Vercel handlers (the backend becomes a standalone Node server on Cloud Run).
- Local development setup for the two folders.

## Open facts to settle before go-live

- The domain name (the owner will buy it) and which host serves the frontend.
- The Atlas connection URL and Google OAuth client for the production domain (redirect `https://api.<domain>/api/auth/callback/google`).
- Whether the free credit's expiry and Cloud Run's free tier cover real traffic; check current pricing and limits before launch.
