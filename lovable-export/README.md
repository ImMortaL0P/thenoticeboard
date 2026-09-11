# Lovable export (reference only)

This folder keeps the seed migration Lovable generated before credits ran out (project "Job Board India",
id d3d0481a-414d-44da-b98c-3799723292f1). The running app no longer uses Lovable or Supabase.
Everything useful was ported into the standalone app:

- `supabase/migrations/*` -> `prisma/schema.prisma` + `prisma/seed-data.ts`
- `src/locales/en.ts`, `src/locales/hi.ts` -> `src/locales/`
- `src/lib/domain.ts` (eligibility + deadline logic) -> `src/lib/domain.ts`
- `src/styles.css` design tokens -> `src/app/globals.css`
- `src/components/Logo.tsx` -> `src/components/Logo.tsx`

Lovable-specific files (src/integrations/lovable, supabase clients, error reporting,
TanStack Start server entry) were intentionally not carried over.
