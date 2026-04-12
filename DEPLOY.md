# BusinessBook FY26 — Deploy Guide
## Total time: ~15 minutes

---

## STEP 1 — Create Supabase project (5 min)

1. Go to **https://supabase.com** > Sign up (free)
2. Click **New project**
   - Name: businessbook-fy26
   - Region: **West EU (Ireland)**
3. Wait ~2 min for the project to provision

4. Go to **SQL Editor** > **New query**
5. Paste the entire contents of `supabase_schema.sql` > **Run**

6. Go to **Project Settings > API**
   - Copy **Project URL**   → this is VITE_SUPABASE_URL
   - Copy **anon public** key → this is VITE_SUPABASE_ANON_KEY

---

## STEP 2 — Deploy to Vercel (5 min)

### Option A — GitHub (recommended)

1. Create a private GitHub repo: businessbook-fy26
2. Push this folder to it:
   ```
   git init && git add . && git commit -m "init"
   git remote add origin https://github.com/YOU/businessbook-fy26.git
   git push -u origin main
   ```
3. Go to **https://vercel.com** > New Project > Import your repo
4. Add Environment Variables:
   ```
   VITE_SUPABASE_URL       = <your supabase url>
   VITE_SUPABASE_ANON_KEY  = <your anon key>
   ```
5. Click Deploy → live at businessbook-fy26.vercel.app in ~90 sec

### Option B — CLI (no GitHub needed)

```bash
npm install -g vercel
cp .env.example .env.local   # fill in your two keys
vercel --prod
```

---

## STEP 3 — Make yourself admin

1. Open the app URL, enter your email, click the magic link
2. In Supabase SQL Editor run:

```sql
update public.profiles
set role = 'admin', full_name = 'Elio Santos'
where email = 'YOUR@EMAIL.COM';
```

3. Refresh the app — you now have full admin access

---

## STEP 4 — Invite team members

In the app, go to **Users** page:
- Enter email + role (vgt / ect / viewer)
- Click **Send invite** — they receive a magic link, no password

| Role    | Access |
|---------|--------|
| admin   | Everything |
| vgt     | VGT deals only — add/edit/delete |
| ect     | ECT deals only — add/edit/delete |
| viewer  | Read-only dashboard + deals |

---

## Cost: €0

Both Supabase free tier and Vercel hobby tier are more than enough
for this usage level. No credit card required.

---

## Troubleshooting

- **Blank page** → Vercel > Deployments > View logs
- **Magic link not arriving** → Check spam; Supabase > Auth > Logs
- **No deals showing** → Check your role in Supabase:
  `select email, role from public.profiles;`
