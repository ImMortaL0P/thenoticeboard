# thenoticeboard

A verified notice board for Indian government, PSU, banking, railways, defence, state PSC and verified
private recruitment notifications — deadlines, fees, eligibility and official download links in one place.

Standalone Next.js app. **No Lovable or Supabase dependency** — your own database, your own auth.

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router, server actions), React 19, TypeScript |
| Styling | Tailwind CSS v4 with semantic design tokens (`src/app/globals.css`) |
| Database | Prisma ORM — SQLite file locally, switch to Postgres for production |
| Auth | Email + password (bcrypt) with a signed JWT cookie (`jose`) |
| i18n | English + Hindi dictionaries (`src/locales/`), cookie-based, easy to add more languages |
| Later phases | `cheerio` + `pdf-parse` scraper worker, `node-cron`, Telegram Bot API, optional AI extraction |

## Run it locally

Requires Node.js 20+.

```bash
cd thenoticeboard
npm install          # also runs `prisma generate`
cp .env.example .env # already present; edit AUTH_SECRET and ADMIN_PASSWORD
npm run setup        # creates prisma/dev.db, seeds 21 sample notices, 16 sources and the admin user
npm run dev          # http://localhost:3000
```

Sign in at `/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` to see `/admin`.

Useful scripts:

- `npm run db:studio` — browse/edit the database in a GUI
- `npm run db:reset` — wipe and reseed
- `npm run make-admin -- someone@example.com admin` — promote a user (or `reviewer`)
- `npm run typecheck`, `npm run build`

## What works now (Phase 1 base)

- Notice board with search, sector chips, stats strip and filters (qualification, age + category relaxation,
  experience, state, status, max fee, free-for-reserved, posted within, sort) — filters live in the URL
- Notice cards showing vacancies, qualification, age, fee (gen/reserved), last date, countdown with urgency colour,
  “verified from” badge, New/Updated/Sample tags, eligibility chip when a profile exists
- Notice detail page: key facts, dates timeline, eligibility + age relaxation table, fee and vacancy tables,
  selection/pay, official PDF/apply/website links, updates & corrigenda, add-to-calendar (.ics)
- Sign up / sign in / sign out, admin overview with counts
- English ⇄ हिंदी toggle, light/dark theme, mobile bottom-sheet filters

Placeholders (marked “Planned”) exist for eligibility checker, calendar, profile, employer portal.
See **PLAN.md** for the build order.

## Project layout

```
prisma/           schema.prisma, seed.ts, seed-data.ts (sample notices + official sources)
src/app/          routes (App Router). (auth)/ holds login, signup and auth server actions
src/components/   Board, NoticeCard, Header, Footer, AuthForm, I18nProvider...
src/lib/          domain.ts (deadline + eligibility logic), auth.ts, db.ts, i18n*.ts
src/locales/      en.ts, hi.ts
scripts/          make-admin.ts
lovable-export/   reference copy of what Lovable generated (not used at runtime)
```

## Moving to production

1. In `prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"`, set `DATABASE_URL` to a Postgres URL
   (Neon, Supabase-as-plain-Postgres, Railway, RDS…), run `npx prisma db push` then `npm run db:seed`.
2. Set a strong `AUTH_SECRET` and `SITE_URL=https://yourdomain`.
3. Deploy the web app (Vercel, Render, Railway, a VPS with `npm run build && npm start`).
4. From Phase 3 on, also run the worker process (`npm run worker`) on a machine that stays on.
