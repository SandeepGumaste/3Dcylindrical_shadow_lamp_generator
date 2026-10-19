# Accounts, download history and a static site: design

Date: 2026-10-19. Status: draft for approval.

## Intent and why

Odd Shadows turns an image into a printable shadow lamp. Today it is a pure browser app (a Vite build, no server, no accounts). The owner wants to (1) know what people make, by capturing the image and all settings every time someone downloads a model, (2) let each person see their earlier downloads and load one back with its settings, and (3) have a proper public front door that ranks in search. Go-live happens once all three parts below are done.

## What is being built

Three pieces, built in this order, each ending in something testable. There is one go-live, after all three.

1. **Static site and app split.** Five static pages: landing (`/`), privacy policy (`/privacy`), legal notice (`/legal`), FAQ (`/faq`) and terms (`/terms`), with the SEO basics. The existing app moves to `/app`, unchanged. No backend needed.
2. **Backend.** Login with OAuth, a database of history records, image upload to imgbb, and endpoints to save, list, load and delete history entries.
3. **App integration.** The login gate on the download buttons, the loading state, the History list with Load, and delete.

## How downloads work after this

- Anyone can use the app, see the preview and change settings without logging in.
- Pressing **Download STL** (and **Download SVG**) requires being logged in. Not logged in: the login flow starts, and the download continues after it.
- While logged in, pressing a download button shows a loading state. The app sends the **processed 512 px grayscale image the generator actually uses** (not the original upload) and **every setting** to the backend. The backend uploads the image to imgbb, then saves one record. When that is done the download starts.
- No notice is shown at download time (owner's decision). The privacy policy says what is stored.
- If the **imgbb upload fails**, the backend still saves the record with the settings only, marked "image upload failed", and the download still starts. The History entry later says the image was not saved; Load restores the settings and the person uploads the image again.
- If the **database save fails**, the download is blocked and an error says so.
- Gate is enforced in the browser (the model is built in the browser), so a determined user could bypass it. This is accepted.

## History

- A logged-in person gets a History list: date, thumbnail, image name and the key settings, newest first.
- **Load** puts the stored image and all settings back into the app and the model regenerates (the app already regenerates when the image changes). Because generation is deterministic, the STL is rebuilt, not stored.
- **Delete** removes the record and the image on imgbb (using the stored delete link).
- The record stores a `mode` (today always Tealight shade) and an app version, so the future Box shadow mode can use the same storage.

## Goals

- Every successful download by a logged-in user creates exactly one record containing the image link (or the failure mark), the full settings, the app version, the mode, the user and the time.
- A user sees only their own history. Image links are never listed publicly: they exist only inside the owner's records and are shown only to that user.
- The five static pages load fast (no framework on them, almost no JavaScript), and each has a title, description, canonical link, share image tags, and valid structured data (FAQ page markup on `/faq`), plus `sitemap.xml` and `robots.txt`.
- The existing app, including both Guided and Advanced views, works as before at `/app`.

## Non-goals

- Pageview or usage analytics beyond the history records. No analytics scripts.
- Storing STL files, payments, an admin dashboard, sharing history with other people.
- Storing the original uploaded image.
- Any other pages (no blog, gallery or per-image pages).
- Box shadow mode integration (the record format is ready for it; wiring it is later).

## Anti-goals (a failure even if it technically works)

- A person's history showing someone else's records or images.
- The imgbb key, the database credentials or any secret reaching the browser.
- A record for a download that did not happen, or a download that silently did not record when the database was healthy.
- The Tealight app or its speed getting worse, or the landing page being slow.
- Locking a user out of the app (the preview and settings must work without login).

## Constraints and decided stack (owner's choices unless marked)

- **Hosting:** Vercel. The Vite app stays; Vite builds the static pages and the app from one repo (multi-page build). The backend is Node functions in an `/api` folder, no always-on server.
- **Database:** MongoDB Atlas.
- **Login:** OAuth, Google first; sessions in secure cookies; Auth.js (with its MongoDB adapter) is the intended library.
- **Image storage:** imgbb, through its upload API, called only from the backend with the key in an environment secret. The image link is reachable by anyone who has it; links are not published anywhere. Keep the delete link for deletion.
- **Free tiers:** Atlas M0 is 512 MB (about 3,000 to 10,000 records with the small image link stored; images are not stored in MongoDB). Vercel Hobby limits stop a feature when exceeded.
- The owner is the sole operator, personally (a person, not a company).

## My calls (the owner can overturn these)

- Google is the first provider; GitHub only if the owner wants it.
- The Download SVG button is gated and recorded exactly like STL.
- The History list shows the latest 50 with a "load more".
- Each save is rate limited per user (for example 30 per hour) to protect the free tiers.
- The privacy policy, terms, legal notice and FAQ are drafted by Claude as a starting point, not legal advice, and a lawyer should review the privacy policy and terms before go-live. Placeholders mark the owner's full name, country and contact email.
- The landing page is designed with the owner in a separate design step when piece 1 starts; this document does not fix its look or wording.

## Left to the builder

- The exact auth setup (library configuration, cookie settings, CSRF), the MongoDB collections, indexes and validation, and the API shapes.
- Image handling details: encoding the processed image, size limits, content checks.
- Rate limiting, error messages and the loading and error copy.
- The static-page build (shared header and footer, sitemap generation, share images), structured data and a performance check.
- Local development setup (`vercel dev` or similar), environment variable names, and a test approach for the endpoints with the database and imgbb replaced by fakes.
- How a logged-out download resumes after login.
- Account and data deletion for the privacy policy (at least: a user can delete each history entry; whether to offer "delete my account and all data" is for the builder to propose).

## Open facts to settle before go-live

- Whether Odd Shadows is a commercial product. Vercel's free Hobby plan allows personal, non-commercial use only; commercial use needs the Pro plan.
- imgbb's terms, rate limits and how long it keeps images are not confirmed. If images disappear, those entries lose their image (the settings-only fallback covers this).
- Whether Atlas's free tier pauses or loses data without backups is not confirmed; if it matters, use a paid tier.
- The owner's country and contact email (for the legal pages), the domain name, and whether to add GitHub login.
