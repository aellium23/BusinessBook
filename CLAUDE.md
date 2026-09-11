# BusinessBook — Project Conventions

## In-app Help (HelpGuide) — ALWAYS keep in sync
Whenever a user-visible feature is added or changed, update
`src/components/HelpGuide.jsx` in the **same commit**, in **all three
languages** (en / es / pt — use European Portuguese: utilizador, ecrã,
ficheiro). Preserve the existing object structure/keys (title, description,
features, steps, shortcuts, mistakes, seeAlso, role notes) — only edit the
content. New pages get a new `'/path'` entry. Do not wait to be asked.

## Documentação
`docs/` guarda o que este ficheiro não tem espaço para dizer:
`BUSINESS_RULES.md` (numeradas, BR-xxx), `PERMISSIONS.md` (papel × página ×
dado), `DATA_CONTRACTS.md` (**as unidades das colunas — leia-se antes de mexer
em margens**), `DESIGN_SYSTEM.md`, `BACKLOG.md` (o que ficou aberto) e
`RELEASE_NOTES.md`. São descritivos até serem revistos: registam o que o sistema
faz, não o que devia fazer.

## Stack
- React 18 + Vite 5 + Tailwind 3 + Supabase (Postgres + Auth + RLS)
- Code-split routes via `lazyWithRetry` in `src/App.jsx`
- i18n: `src/lib/i18n.js` (custom, zero-dep), hook `useTranslation`

## Data / value conventions
- Supabase returns numerics as strings — always `Number()` coerce.
- A deal's value: `fy26 (sum of monthly columns) || value_total` — use this
  fallback consistently across every view (Dashboard, Deals, Kanban, funnels).
- Stage weights (forecast): Lead 0.10, Pipeline 0.30, Offer 0.60,
  BackLog 1.00 (already adjudicated), Invoiced 1.00, Lost 0.
- Group dashboard funnels case-insensitively (trim + lowercase keys).

## Git
- Build (`npx vite build`) before every commit; keep `npm run test` green.
  `npm run test` runs the linter first: it is the only check that sees a name
  used before it exists or a helper called without being imported, both of which
  compile and both of which have reached production.
- Push to BOTH remotes: `gitlab` (Vercel deploys from here) and `origin`.
- SQL migrations: paste the runnable SQL in chat for the user to run; include
  `DROP FUNCTION IF EXISTS` before recreating functions with changed signatures.

## Security
- Brand discount approvers / distributors can't write to `deals` via RLS —
  use SECURITY DEFINER RPC functions (e.g. `respond_discount_request`).
- Distributors: company_id-scoped; never expose cost_price/margin_pct.
