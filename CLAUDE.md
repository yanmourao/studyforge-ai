# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyForge AI — a study-planning SaaS prototype. Single-page vanilla-JS frontend + Express/Postgres backend. **No frontend framework, no bundler, no test runner.** The three frontend files (`public/index.html`, `public/app.js`, `public/styles.css`) are served as-is (by Next's static handler on Vercel, by `express.static` on Render) and edited directly. Next.js is only a hosting shell: `pages/api/[...path].js` hands every `/api/*` request to the same Express app, and `next.config.js` rewrites `/` to `/index.html`. Don't rewrite the SPA into React.

## Commands

```bash
npm install
node server.js          # or: npm start — Express only (Render path), PORT from .env
npm run dev             # next dev on 3001 (Vercel path)
npm run build           # next build
npm run db:reset        # scripts/setup-db.js — DROPS and recreates the users table (destructive)
```

- There are **no tests and no linter** (`npm test` is a stub). Verify changes by running the server and driving the app in a browser.
- The server refuses to boot if `SESSION_SECRET` is missing/shorter than 16 chars. `.env` is required for local dev (PG* vars, `SESSION_SECRET`, optionally `STRIPE_*`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET`). See README for the full list.
- Killing all node processes (`taskkill //F //IM node.exe` on Windows) stops the dev server; `ERR_CONNECTION_REFUSED` at localhost:3001 just means it isn't running — restart it.

## Architecture

**Single-origin deploy on Vercel, Render kept as an alternative.** Both run the same `server.js` (it exports the app and only `listen()`s when run directly). `public/app.js` picks the API base at runtime: same-origin unless the host ends with `github.io` (legacy GitHub Pages split, still supported). All frontend↔backend calls use `credentials: "include"` (cookie auth), so **CORS matters** — `server.js` reflects the request origin only if it's in the `ALLOWED_ORIGINS` allowlist (never `*`).

**Frontend is one global state object.** `app.js` has a single `state` object; there is no framework. Screens (landing / onboarding / login / dashboard) toggle via the `.active-screen` class; dashboard sub-views via `data-view-panel` + `.active-view`. A single delegated `document.click` handler dispatches on `data-action` / `data-view` attributes — wire new buttons through those, not per-element listeners. Any user-provided text rendered via `innerHTML` (e.g. custom syllabus topics) MUST go through `escapeHtml()` to avoid stored XSS.

**DB migrations live in `db.js` `ensureSchema()`** and run on every server boot. To add a column/table, append an idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` there — do not write separate migration files. `db.js` uses `DATABASE_URL` (Render, SSL) when present, else the individual `PG*` vars (local).

**Auth is cookie-based, no JWT library.** `server.js` issues an HMAC-signed session token (`crypto`, `SESSION_SECRET`) in an `HttpOnly` cookie. Cookie flags differ by environment: prod uses `SameSite=None; Secure` (required cross-site GitHub Pages → Render), dev uses `SameSite=Lax`. Passwords are bcrypt (`bcryptjs`). Login is deliberately timing-safe (always runs a bcrypt compare against a dummy hash when the user doesn't exist) and returns a generic error to prevent account enumeration.

**Study data model.** `users` holds the profile (`objective`, `exam_days`, `subjects` JSONB, etc.), persisted via `POST /api/profile` and restored in `/api/login` + `/api/me`. `study_sessions` and `syllabus_progress` are per-user. The dashboard is fully data-driven from these tables (`GET /api/dashboard`) — there are no demo numbers.

**Syllabus → plan is the core feature.** `SYLLABUS` (base topics per subject) + `SYLLABUS_OVERRIDES` (per-objective, e.g. SAT math) in `app.js` define the exam curriculum. The user rates each topic (Não sei / Estudando / Já domino), stored in `syllabus_progress`; custom topics are just extra rows. `renderWeekPlan()` builds the weekly plan by pulling real topics from `pendingQueue()`, prioritizing `unknown > learning > mastered`, and fills the whole free-time window with ~1h blocks (plus a 1h break when free time > 3h).

**Security middleware (all in `server.js`, dependency-free).** In-memory per-IP rate limiters on `/api/login`, `/api/signup`, `/api/billing/checkout`; strict input validation (email format, length caps, integer IDs, `HH:MM`); a 16 KB JSON body cap with a JSON error handler; optional Cloudflare Turnstile (`verifyTurnstile`, no-op unless `TURNSTILE_SECRET` is set).

**Stripe.** Subscription checkout + webhook. The webhook route (`/api/billing/webhook`) is registered with `express.raw()` **before** the global `express.json()` because Stripe signature verification needs the raw body — keep that ordering. All `STRIPE_*` vars are optional; without them checkout returns 503 gracefully.

**The Tutor IA is still simulated** (`tutorReply()` in `app.js` returns hardcoded strings). Real Claude API integration is the known next step but not yet implemented.
