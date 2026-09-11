# CLAUDE.md — context for Claude Code

Project: **thenoticeboard** — verified notice board for Indian govt/PSU/banking/railways/defence/state PSC and
verified private recruitment. Owner builds phase by phase; the roadmap is in `PLAN.md`. Work on one phase at a time
and tick its checklist when done.

## Stack & conventions
- Next.js 15 App Router + React 19 + TypeScript (strict). Server components by default; `"use client"` only for
  interactive pieces. Mutations via server actions (`"use server"` files next to the route, e.g. `src/app/(auth)/actions.ts`).
- Next 15: `params`, `searchParams` and `cookies()` are **async** — always `await` them.
- Prisma (`src/lib/db.ts` exports `prisma`). SQLite locally, Postgres in prod, so: no Prisma enums, no scalar lists.
  Enum-like fields are `String`, list/object fields are `Json`. Convert DB rows with `toNotice()` before passing to
  client components (it parses Json and serialises Dates).
- Dates of notices are `YYYY-MM-DD` strings. Use helpers in `src/lib/domain.ts` (`todayIST`, `daysBetween`,
  `getDeadline`, `formatDate`). India time (IST) is the reference for "today".
- Eligibility rules live only in `checkEligibility()` / `relaxationYears()` in `src/lib/domain.ts`. Reuse, don't fork.
- Auth: `getCurrentUser()`, `requireUser()`, `requireStaff()`, `requireAdmin()` in `src/lib/auth.ts`. Roles are
  `user | employer | reviewer | admin` on `User.role`. Every admin page and admin action must call `requireStaff()` or
  `requireAdmin()` server-side.
- Styling: Tailwind v4 tokens in `src/app/globals.css` (`bg-card`, `text-muted-foreground`, `text-urgent`, `bg-open-soft`,
  etc.) plus primitives `.btn .btn-primary .btn-outline .input .label .card .chip .table-base`. Never hardcode colours.
  Keep cards information-dense: last date, vacancies, age, qualification, fee must be visible without clicking.
- i18n: every candidate-facing string goes through `t()` — server: `const { t, lang } = await getT()`
  (`src/lib/i18n-server.ts`); client: `const { t } = useI18n()`. Add keys to `src/locales/en.ts` first, then `hi.ts`.
  Admin UI can stay English-only.
- No Lovable/Supabase SDKs. Keep dependencies minimal; prefer small hand-written components over UI kits.

## Commands
- `npm run dev` · `npm run typecheck` · `npm run build`
- `npm run db:push` after editing `prisma/schema.prisma` · `npm run db:reset` to reseed · `npm run db:studio`
- `npm run worker` (from Phase 5) runs scraper cron + Telegram bot

## Guardrails
- Only official/verified sources. Scraped items are **never** auto-published: they land as `pending_review`.
- Keep the "verify on the official notification" disclaimer on detail pages and footer.
- Sample data has `isSample = true` and shows a "Sample" tag; don't remove the tag logic.
