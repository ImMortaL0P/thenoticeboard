# thenoticeboard — phase-by-phase build plan

Each phase ends with something you can run and check in the browser. Work through them in order in VS Code with
Claude Code. A good prompt pattern for each phase:

> Read CLAUDE.md and PLAN.md. Implement **Phase N** only. Follow the checklist, run `npm run typecheck` and
> `npm run build`, fix errors, then tick the boxes in PLAN.md and summarise what changed.

---

## Phase 0 — Get the base running (you, ~15 min)

- [ ] Install Node.js 20+ (`node -v`)
- [ ] `npm install` → `npm run setup` → `npm run dev`, open http://localhost:3000
- [ ] Sign in as the admin from `.env`, open `/admin`
- [ ] Change `AUTH_SECRET` and `ADMIN_PASSWORD` in `.env`
- [ ] `git init && git add -A && git commit -m "Base project"` (create a private GitHub repo)
- [ ] Ask Claude Code: “run typecheck and build and fix anything broken” (the base was written without being able to
      install packages, so expect a few small fixes: the Prisma `Json @default("[]")` on SQLite, type errors, etc.)

**Done when:** the board shows 21 sample notices, filters work, a notice page opens, sign in/out works.

## Phase 1 — Polish the candidate board (1 session)

- [ ] Save/unsave button on cards and detail page (`SavedNotification`), requires login
- [ ] Share buttons on detail page: WhatsApp, Telegram, copy link
- [ ] Mobile menu (sheet) for About/Contact/Employers/Admin links
- [ ] Organisation logos (fallback: initials badge coloured by sector)
- [ ] Loading skeletons (`loading.tsx`) and error boundary (`error.tsx`)
- [ ] SEO: `generateMetadata` per notice, `sitemap.ts`, `robots.ts`, JSON-LD `JobPosting` on detail pages
- [ ] Pagination or “load more” once there are >60 notices (move filtering to the server with Prisma `where` when needed)

**Done when:** a candidate on a phone can find, save and share a notice comfortably.

## Phase 2 — Profile, eligibility checker, deadline calendar (1–2 sessions)

- [ ] `/profile`: form for name, DOB, gender, category, PwBD, ex-servicemen, highest qualification, stream,
      experience, state, preferred sectors, language (server action + zod validation)
- [ ] Saved notices list on profile (sorted by last date, urgency colours)
- [ ] `/eligibility`: works without login (form state in URL), prefilled from profile when logged in; shows
      “eligible for X of Y”, then Eligible / Need more details / Not eligible lists with reasons (use `checkEligibility`)
- [ ] Verify relaxation rules with real notices: SC/ST +5, OBC +3, PwBD +10 (cumulative with category), ESM, state
      domicile/female relaxations (add fields like `domicileRequired` if needed)
- [ ] `/calendar`: month grid + list view of apply-last, fee-last, exam, admit card, result dates; colour legend;
      “saved only” toggle; each event links to the notice; combined .ics feed for saved notices
- [ ] Hindi strings for everything added

**Done when:** filling a profile turns every card’s chip into Eligible / Not eligible, and the calendar shows deadlines.

## Phase 3 — Admin panel (2 sessions)

- [ ] Admin layout with sidebar: Dashboard, Review queue, Notices, Sources, Organisations, Employers, Users, Scrape runs
- [ ] **Review queue**: list `pending_review` items; side-by-side view of extracted fields vs raw text / PDF link;
      edit → Approve (status `published`, set `reviewedById`, `sourceVerifiedAt`) or Reject (with reason)
- [ ] **Notice editor** (create/edit): all fields including JSON editors for fees, vacancy breakup, age relaxation,
      posts, streams; Hindi title/summary; duplicate detection by advertisement no. + organisation
- [ ] Updates/corrigenda: add date extension, corrigendum, admit card, answer key, result to a notice
      (date extension should also update `applyLast`)
- [ ] Close/archive: auto-close notices past `applyLast` (daily job or on read)
- [ ] Organisations CRUD (name, short name, sector, state, website, logo URL, verified flag)
- [ ] Users: search, change role (admin only)
- [ ] Audit log of admin actions (who approved/edited what)

**Done when:** you can add a real notice by hand from an official PDF in under 5 minutes and it appears on the board.

## Phase 4 — Verified private employers (1 session)

- [ ] `/employer`: employer signs up → submits company verification (company name, website, official email,
      GSTIN/CIN, contact) → `EmployerProfile.status = pending`
- [ ] Email-domain check: official email domain must match website domain (flag mismatches for admin)
- [ ] Admin → Employers: verify/reject; verifying creates/links an `Organization` with `sector = private`, `isVerified = true`
- [ ] Verified employers get a “Post an opening” form (same fields as notice editor, simplified) → `pending_review`
      with `origin = employer`; they see status of their submissions
- [ ] Rate limit submissions; employers can’t publish directly

**Done when:** a test company can register, get verified, post an opening, and you approve it from the queue.

## Phase 5 — Scraper worker (2 sessions)

- [ ] `worker/index.ts` (run with `npm run worker`): `node-cron` on `SCRAPE_CRON` (default every 3 h), runs sources whose
      `lastRunAt + intervalHours` is due; `--scrape-once` flag for manual runs
- [ ] `src/lib/scraper/`: fetch page (timeout, `SCRAPE_USER_AGENT`, respect robots.txt), `cheerio` to collect links
      matching `linkSelector` + `includePattern`/`excludePattern`; resolve relative URLs; skip links already in
      `DiscoveredLink`; cap at `SCRAPE_MAX_NEW_PER_SOURCE`
- [ ] For each new link: if PDF → download (size cap) → `pdf-parse` text; else page text. Store `rawText`.
- [ ] Extraction (`src/lib/extract.ts`): if `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set, ask the model for strict JSON
      matching the notice fields (validate with zod); otherwise rule-based regex for dates, vacancies, age, fees,
      qualification keywords. Save as `Notification` with `status = pending_review`, `origin = scraper`,
      `extractionMethod`, `discoveredUrl`, `sourceId`
- [ ] Scanned PDFs: detect empty text and flag “needs manual entry” (optional later: OCR with tesseract)
- [ ] `ScrapeRun` log per source; on 3 consecutive failures mark source unhealthy and show it on the admin dashboard
- [ ] Admin → Sources: add/edit/disable, “Run now” button, last run status, found links preview
- [ ] Tune the 16 seeded sources one by one (several official sites need a specific sub-page or selector)

**Done when:** running `npm run scrape:once` fills the review queue with real items from official sites.

## Phase 6 — Telegram alerts (1 session)

- [ ] Create bot with @BotFather, set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME`
- [ ] Profile → “Connect Telegram”: generate `telegramLinkCode`, deep link `https://t.me/<bot>?start=<code>`
- [ ] Worker long-polls `getUpdates`: `/start <code>` links `telegramChatId`; `/stop` unlinks; `/latest` sends 5 newest
- [ ] On publish (admin approve): send to users with alerts on, matching preferred sectors and (if `alertOnlyEligible`)
      eligibility; record in `AlertLog` (unique per user/notice/kind) to avoid duplicates; throttle to ~25 msg/s
- [ ] Daily 9:00 IST reminders for saved notices closing in 3 days and 1 day
- [ ] Updates (date extension/corrigendum) notify users who saved that notice
- [ ] Optional public Telegram channel that receives every published notice

**Done when:** approving a notice pings your own Telegram within a minute.

## Phase 7 — Languages, accessibility, performance (1 session)

- [ ] Complete Hindi coverage; Hindi titles/summaries filled by AI during extraction (reviewed in admin)
- [ ] Add a third language scaffold (e.g. Bengali or Marathi) to prove the i18n setup
- [ ] Accessibility pass: keyboard navigation, focus states, contrast in both themes, screen-reader labels
- [ ] Performance: server-side filtering + pagination, DB indexes, caching of the board query (revalidate on publish)

## Phase 8 — Production launch (1 session)

- [ ] Switch Prisma to Postgres; migrations with `prisma migrate`
- [ ] Deploy web app (Vercel/Render/Railway/VPS) and worker (Render background worker, Railway service, or a small VPS
      with pm2/systemd)
- [ ] Domain + HTTPS, `SITE_URL`, secure cookies
- [ ] Backups of the database, uptime monitoring, error tracking (Sentry)
- [ ] Legal pages: disclaimer, privacy policy, terms; contact email
- [ ] Remove or hide sample data (`isSample = true`) before launch
- [ ] Analytics (privacy-friendly, e.g. Plausible/Umami)

## Later ideas
- Email alerts (Resend/SES) and web push
- Admit card / result / answer key tracker per notice
- Exam-wise pages (e.g. `/exam/ssc-cgl`) for SEO
- Previous years’ cut-offs and vacancy trends
- Android app (PWA first)
