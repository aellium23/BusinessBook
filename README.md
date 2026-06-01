# BusinessBook — Healthcare IT Sales CRM

A comprehensive sales management platform built for Fujifilm Healthcare medical imaging, adaptable to any Healthcare IT business unit.

## Tech Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security + Storage)
- **Deployment**: Vercel (auto-deploy from Git)
- **Charts**: Recharts

## Features

- **Deals Management** — Pipeline, Kanban, Map views with multi-product catalog
- **Contracts & Recurring** — SLA lifecycle, renewal tracking, revenue recognition
- **Product Catalog** — 90+ products with pricing, licensing types, components
- **Dashboard** — Summary + Classic views, VGT/ECT split, Public/Private, FCT Manual
- **Budget / P&L** — Full P&L with Variable/Fixed COGS, R&D, SG&As, BAPA, OP1/OP2
- **Clients & Accounts** — Unified hierarchy, region/country filters, public/private
- **Tasks & Tenders** — Linked to deals, with requirements matrix and attachments
- **Forecasting** — Auto (from deals) + Manual FCT snapshots
- **Multi-language** — English, Spanish, Portuguese (PT-PT)
- **Mobile-first** — Optimised for iPhone, touch-friendly, responsive

## Quick Start (New Company)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd businessbook
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon public key** (Settings → API)

### 3. Set up environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key
```

### 4. Set up the database

Run the SQL migrations in order in **Supabase Dashboard → SQL Editor**:

1. `supabase_migration_20260414.sql` — Base schema (deals, profiles, etc.)
2. `supabase_migration_20260415.sql` — Tenders, attachments, contacts
3. `supabase_migration_20260416.sql` — Forecast category on deals
4. `supabase_migration_20260417.sql` — Tasks and notifications
5. `supabase_migration_20260418_accounts.sql` — Accounts hierarchy
6. `supabase_migration_20260418_audit.sql` — Audit log
7. `supabase_migration_20260419_distribution.sql` — Distribution network
8. `supabase_migration_fix_all_missing.sql` — **All new tables** (products, SLAs, deal_products, etc.)
9. `supabase_migration_20260424_contract_states.sql` — Contract lifecycle states

Or run `supabase_migration_ALL.sql` first, then `supabase_migration_fix_all_missing.sql`.

### 5. Configure authentication

In Supabase Dashboard:
- **Authentication → Providers → Email**: Enable
- **Authentication → URL Configuration → Site URL**: Set to your Vercel URL

### 6. Create first admin user

In Supabase Dashboard:
- **Authentication → Users → Add user** (email + password)
- Then in **SQL Editor**:
```sql
UPDATE profiles SET role = 'admin', bu = 'VGT' WHERE email = 'your@email.com';
```

### 7. Run locally

```bash
npm run dev
```

Open http://localhost:5173

### 8. Deploy to Vercel

1. Push to GitHub/GitLab
2. [vercel.com](https://vercel.com) → Import project
3. Set environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
4. Deploy

## Customisation for Your Company

### Change Business Units

Edit `src/constants.js`:
```js
export const BUS = ['YOUR_BU1', 'YOUR_BU2']
```

Update check constraints in SQL:
```sql
ALTER TABLE deals DROP CONSTRAINT deals_bu_check;
ALTER TABLE deals ADD CONSTRAINT deals_bu_check CHECK (bu IN ('YOUR_BU1','YOUR_BU2'));
-- Repeat for slas, accounts, etc.
```

### Change Products

1. Go to **Products** page in the app (admin only)
2. Edit/add/remove products and pricing
3. Or modify the seed SQL in `supabase_migration_20260424_complete.sql`

### Change Regions/Countries

Edit `src/constants.js`:
```js
export const REGIONS = ['Europe', 'MEA', 'LATAM', 'APAC', 'NA']
```

Country lists are in components that use `COUNTRY_MAP`.

### Change Branding

- Logo: `src/components/Layout.jsx` (base64 image in header)
- Colors: `tailwind.config.js` (navy, vgt, ect brand colors)
- App name: `src/components/Layout.jsx` header title

### Change Languages

Edit `src/lib/i18n.js` — all translation keys in EN, ES, PT sections.

## Roles & Permissions

| Role | Access |
|------|--------|
| admin | Full access, manage users, see all BUs |
| manager | Own BU, edit all, delete, manage targets |
| member | Own BU, edit own records only |
| distributor | Own deals/clients only |
| viewer | Read-only |
| partner | Limited read-only |

Custom permission sets can override role defaults via the Permissions page.

## Project Structure

```
src/
├── components/     # Reusable UI components
│   ├── DealForm.jsx
│   ├── ProductLineItems.jsx
│   ├── SearchableSelect.jsx
│   ├── KanbanBoard.jsx
│   ├── Layout.jsx
│   └── ui.jsx          # Design system (Modal, Spinner, formatK, etc.)
├── hooks/          # Data hooks
│   ├── useAuth.jsx     # Auth context + role permissions
│   ├── useDeals.js
│   ├── useSlas.js
│   ├── useProducts.js
│   └── useTasks.js
├── pages/          # Route pages
│   ├── Dashboard.jsx
│   ├── Deals.jsx
│   ├── SLAs.jsx        # Contracts & Recurring
│   ├── Products.jsx
│   ├── Clients.jsx
│   ├── Budget.jsx
│   └── ...
├── lib/
│   ├── supabase.js     # Supabase client
│   ├── i18n.js         # Translations (EN/ES/PT)
│   └── storage.js      # File upload helpers
├── constants.js        # Business constants
└── App.jsx             # Router + auth guard
```

## Support

For questions about setup or customisation, open an issue in the repository or contact the development team.
