# Static Site and App Split Implementation Plan (piece 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five static, search-friendly pages (landing, privacy, legal notice, FAQ, terms) at the site root, and the existing app moved to `/app`, built from one Vite project and deployable on Vercel.

**Architecture:** Vite multi-page build: `index.html` becomes the static landing page, `app/index.html` is the existing app entry, and each other page is a plain HTML file. A small Vite plugin fills shared header and footer partials and emits `sitemap.xml` and `robots.txt`. Pure helpers (partials, sitemap, robots, a page-metadata checker) are test-first. The landing page design is a gate task with the owner.

**Tech Stack:** Vite 8, plain HTML and CSS for the static pages (no framework, no JavaScript on them), TypeScript for the plugin and its tests, Vitest, Playwright (already used for checks) for smoke tests, Vercel (`vercel.json`).

**Spec:** `docs/superpowers/specs/2026-10-19-accounts-history-and-site-design.md` (piece 1). Pieces 2 (backend) and 3 (app integration) get their own plans.

## Global Constraints
- Five static pages: landing (`/`), `/privacy`, `/legal`, `/faq`, `/terms`. No other pages. Each has a title, description, canonical link, share-image tags and valid structured data (FAQPage markup on `/faq`); the site has `sitemap.xml` and `robots.txt`.
- Static pages load fast: no framework, almost no JavaScript (none is the target), no analytics scripts.
- The existing app, including the Guided and Advanced views, works as before at `/app` (assets, the web worker, fonts, welcome dialog, generation).
- Privacy policy, terms, legal notice and FAQ are drafted as a starting point, not legal advice, with placeholders `[[FULL_NAME]]`, `[[COUNTRY]]`, `[[CONTACT_EMAIL]]`. A production build must fail while any `[[` placeholder remains.
- The landing page look and wording are designed with the owner in a separate design step (Task 5); do not invent them.
- The site address comes from one variable, `VITE_SITE_URL` (canonical links, sitemap, share-image URLs); never hard-code a host.
- The Tealight go-live must not be put at risk: the app code under `src/` does not change in this piece.
- The privacy policy and FAQ describe the finished product (login, history, image and settings stored on download, deletion), because go-live happens after all three pieces.

## Review Focus
- Deep links and refresh under `/app` (a Vercel rewrite to `/app/index.html`) and under clean URLs (`/privacy` without `.html`).
- A production build with a `[[` placeholder left in any page must fail.
- The landing page ships no script tags and stays under its weight budget; canonical, sitemap and share-image URLs use `VITE_SITE_URL`, never localhost.
- FAQ structured data matches the visible questions and answers word for word.
- The app at `/app` still loads its worker, fonts, favicon and built-in images, and the welcome dialog and Tealight generation work.

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Landing page (static) |
| `app/index.html` | The existing app entry (moved) |
| `privacy/index.html`, `legal/index.html`, `faq/index.html`, `terms/index.html` | Static pages |
| `site/partials/header.html`, `footer.html` | Shared header and footer |
| `site/site.css` | Styles for the static pages (no Tailwind) |
| `site/lib/partials.ts`, `sitemap.ts`, `robots.ts`, `seo.ts`, `placeholders.ts` | Pure helpers |
| `vite-plugins/sitePages.ts` | Vite plugin: partials, sitemap, robots, placeholder guard |
| `vite.config.ts` | Multi-page inputs, plugin |
| `vercel.json` | Clean URLs and `/app` fallback |
| `site/__tests__/*.test.ts` | Tests |
| `.env.example`, `docs/deploy.md` | Variable and Vercel setup notes |

---

### Task 1: Move the app to `/app` and make the root a static page

**Files:** Create `app/index.html`, `vercel.json`, `site/__tests__/build.test.ts`; modify `index.html`, `vite.config.ts`.

**Interfaces:** Produces the page map `PAGES = { '/': 'index.html', '/app': 'app/index.html', '/privacy': 'privacy/index.html', '/legal': 'legal/index.html', '/faq': 'faq/index.html', '/terms': 'terms/index.html' }` exported from `site/lib/pages.ts`, used by the config, the sitemap and the tests.

- [ ] **Step 1: Write the failing test** `build.test.ts`: `PAGES` has exactly those six routes; `vite.config.ts` input contains each file in `PAGES`; `vercel.json` has `cleanUrls: true` and a rewrite of `/app/:path*` to `/app/index.html` (and no rewrite catching the other pages).
- [ ] **Step 2: Run it** with `npx vitest run site/__tests__/build.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Copy the current `index.html` to `app/index.html` (keep the `<script type="module" src="/src/main.tsx">`, title, favicon and font links; add `<meta name="robots" content="noindex">`, my call: the landing page is the one that should rank). Replace the root `index.html` with a minimal static placeholder (title, a link to `/app`). Create `site/lib/pages.ts`. In `vite.config.ts` set `build.rollupOptions.input` from `PAGES` (resolve each path). Create `vercel.json` with `cleanUrls: true` and the rewrite.
- [ ] **Step 4: Run the test and the existing suite.** Expected: PASS, 105+ tests.
- [ ] **Step 5: Build and inspect.** Run `npx vite build`; confirm `dist/index.html`, `dist/app/index.html`, `dist/privacy/index.html` (empty placeholders for now are fine) exist and `dist/app/index.html` references hashed JS. Run `npx vite preview` and, with Playwright, open `/app` (welcome dialog or the app shows, Tealight generates a model) and `/` (static). Commit.

### Task 2: Site helpers (partials, sitemap, robots, page checker)

**Files:** Create `site/lib/partials.ts`, `sitemap.ts`, `robots.ts`, `seo.ts`, `site/__tests__/partials.test.ts`, `sitemap.test.ts`, `seo.test.ts`.

**Interfaces:**
- `applyPartials(html: string, partials: Record<string, string>, vars: Record<string, string>): string` replaces `<!-- @include name -->` with the partial and `{{key}}` with `vars[key]`; throws on an unknown include or an unknown `{{key}}`.
- `renderSitemap(siteUrl: string, routes: string[]): string` (XML, absolute URLs, no `/app`); `renderRobots(siteUrl: string): string` (allows all, disallows `/api/`, points at the sitemap).
- `checkPage(html: string, ctx: { route: string; siteUrl: string }): string[]` returns a list of problems (empty when fine): title present and at most 60 characters; description between 50 and 160 characters; exactly one `<h1>`; `<html lang>`; canonical equal to `siteUrl + route`; `og:title`, `og:description`, `og:image` (absolute), `og:url`, `twitter:card`; every JSON-LD block parses; no `<script src>` and no inline script other than `application/ld+json`.

- [ ] **Step 1: Write failing tests** for each function: `applyPartials` replaces includes and vars and throws on unknowns; `renderSitemap` lists absolute URLs for the given routes with `<lastmod>` omitted and excludes anything starting with `/app`; `renderRobots` contains `Disallow: /api/` and `Sitemap: https://example.com/sitemap.xml`; `checkPage` returns no problems for a complete sample page and the specific problem for each defect (too-long title, two h1, relative og:image, wrong canonical, script tag, invalid JSON-LD).
- [ ] **Step 2: Run to verify failure,** then implement the four functions (plain string and regex work; no new dependency).
- [ ] **Step 3: Run the tests, commit.**

### Task 3: The Vite plugin and the shared layout

**Files:** Create `vite-plugins/sitePages.ts`, `site/partials/header.html`, `footer.html`, `site/site.css`, `.env.example`, `site/__tests__/plugin.test.ts`; modify `vite.config.ts`.

**Interfaces:** Consumes Task 2 helpers. `sitePages(options: { siteUrl: string })` is a Vite plugin: in `transformIndexHtml` it applies partials and vars (`siteUrl`, `route`) to the static pages only (not `app/index.html`); in `generateBundle` it emits `sitemap.xml` and `robots.txt`; the site URL defaults to `VITE_SITE_URL`, else `http://localhost:5173` in dev only, and a production build without `VITE_SITE_URL` fails with a clear message.

- [ ] **Step 1: Write failing tests:** the plugin leaves `app/index.html` untouched; a static page gets header and footer and `{{siteUrl}}`; a production build with no `VITE_SITE_URL` throws; with it set, the emitted `sitemap.xml` contains all five static routes and no `/app`.
- [ ] **Step 2: Run to verify failure,** then implement the plugin and wire it into `vite.config.ts`.
- [ ] **Step 3: Build the shared pieces.** Header: brand, links to the app (`/app`), FAQ; footer: Privacy, Legal notice, Terms, FAQ. `site.css`: system fonts, readable measure, light and dark with `prefers-color-scheme`, visible focus, nothing over a few KB. Add `VITE_SITE_URL` to `.env.example`.
- [ ] **Step 4: Run the tests and a build** with `VITE_SITE_URL=https://example.com`; check `dist/sitemap.xml` and `dist/robots.txt`. Commit.

### Task 4: Privacy, legal notice, terms and FAQ (drafts) and the placeholder guard

**Files:** Create `privacy/index.html`, `legal/index.html`, `terms/index.html`, `faq/index.html`, `site/lib/placeholders.ts`, `site/__tests__/pages.test.ts`, `site/__tests__/placeholders.test.ts`; modify the plugin.

**Interfaces:** `findPlaceholders(html: string): string[]` returns every `[[NAME]]` found.

- [ ] **Step 1: Write failing tests:** every static page (all five) passes `checkPage` after the plugin's transform (use the plugin's transform function with a sample site URL); each legal page contains the three placeholders where expected (`/legal`: all three; `/privacy` and `/terms`: name and email); the FAQ JSON-LD (`FAQPage`) lists exactly the visible questions and answers, word for word; every internal link in the header, footer and pages points at a route in `PAGES`; `findPlaceholders` finds them; a production build (the plugin invoked with `mode: 'production'` and `VERCEL_ENV=production`) throws while any placeholder remains and passes when none do.
- [ ] **Step 2: Run to verify failure,** then write the drafts. Content, in plain language, for a person running a hobby site: the **privacy policy** (what is stored: Google account name, email and picture from login; for each download the processed 512 px grayscale image, all settings, the app version and time; the image is kept at imgbb and reachable by its link; why, how long, who sees it (only the user; links are not published), deletion of each entry and of the whole account, how to contact the owner, the processors used: Vercel, MongoDB Atlas, imgbb, Google), the **legal notice** (name, country, contact email), the **terms** (use of the service, the files you generate, your uploads and your responsibility for rights to them, no warranty, 3D printing safety such as PLA softening at about 60 degrees, changes), and an **FAQ** (what it is, how it works, which printers and materials, why login to download, what is stored, how to delete data, LED versus real flame, why Tealight shade only for now).
- [ ] **Step 3: Implement the guard** in the plugin (`generateBundle` or `closeBundle`): in a production build, scan the emitted static pages with `findPlaceholders` and throw with the list. Run the tests, commit.
- [ ] **Step 4:** the drafts keep their placeholders in the repository on purpose; the guard stops them reaching production. Note this in `docs/deploy.md` (Task 6).

### Task 5: Landing page (design gate, then build)

**Files:** Modify `index.html`; create `site/assets/*` as the design requires; create `scripts/make-og.mjs`; extend `site/__tests__/pages.test.ts`.

- [ ] **Step 1: Design gate. Stop and run the design step with the owner** (superpowers brainstorming for the page's purpose and wording, then the frontend-design skill for a full prototype opened in the browser, as was done for the guided UI). Output: an approved prototype of the landing page (hero, how it works in three steps, what you can make, FAQ teaser, call to action to `/app`) and the approved copy. Do not build before approval.
- [ ] **Step 2: Failing tests** extending `pages.test.ts`: the landing page passes `checkPage`; it has no `<script src>` and no JavaScript other than JSON-LD; it contains a link to `/app`; its JSON-LD is a `WebApplication` with name, description and the site URL; one `<h1>`; every `<img>` has `alt`, `width` and `height`; the HTML plus CSS stay under 60 KB and each image under 150 KB (read from the files).
- [ ] **Step 3: Implement** the approved design as static HTML and `site/site.css` additions, with hero imagery made from the real app (a screenshot of the lit preview, exported as WebP at two sizes) and `scripts/make-og.mjs` that renders `site/assets/og.png` (1200 by 630) from the approved hero with Playwright. Run the tests, commit.

### Task 6: Verify, document, finish

- [ ] **Step 1: Browser check** (Chrome via Playwright) on a build served by `vite preview` with `VITE_SITE_URL` set: `/` and the four pages render, header and footer links work, `/privacy` works without `.html`, `/app` loads and Tealight generates, a hard refresh on `/app` works, no horizontal scroll at 320 px, light and dark both readable, no console errors.
- [ ] **Step 2: Write `docs/deploy.md`:** the `VITE_SITE_URL` variable, Vercel framework preset (Vite), output directory `dist`, `vercel.json` behaviour, the placeholder guard, how to check metadata (view-source and Google's Rich Results test), and what is deferred to pieces 2 and 3 (`/api`).
- [ ] **Step 3: Update `ARCHITECTURE.md`** (site structure) and run the full suite and `tsc`. Commit.
- [ ] **Step 4:** fresh whole-branch review; fix Critical and Important findings with failing tests first.
