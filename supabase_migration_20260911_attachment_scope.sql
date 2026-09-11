-- Every attachment in the house is readable by every account with a password.
--
-- The `attachments` bucket was given three policies that say, in full, "you are
-- signed in". The migration that wrote them says why, plainly: path-level checks
-- against deals and tenders "would require re-implementing RLS here". That was
-- a fair trade when the only people with accounts were ours. It is not one now
-- that partners have accounts, because it means a distributor can list the
-- whole bucket, download any object in it — a signed contract, a cost sheet, a
-- competitive analysis on a deal that is none of theirs — and delete any of
-- them.
--
-- The metadata table was never the problem: `attachments` rows are already
-- filtered through the parent deal or tender, so a partner sees the right list.
-- They simply were not what the bucket checked.
--
-- It does not need re-implementing. An object is readable exactly when its
-- metadata row is readable, and that row's policy already does the work — so
-- the storage policy asks the table, and the table answers under the caller's
-- own RLS.
--
-- Upload is the one case that cannot ask, because the object is written before
-- its row exists. There the path itself is checked: `deal/<id>/<file>` may only
-- be written under a deal the caller can see, and `exists (select 1 from deals
-- ...)` is again evaluated under their RLS.
--
-- Requires supabase_migration_20260415.sql (the bucket and the table).
--
-- Safe to run more than once.

-- ── reading ─────────────────────────────────────────────────────────────────
-- An object you may read is an object whose row you may read.
drop policy if exists "authenticated read attachments" on storage.objects;
drop policy if exists "attachments read own scope" on storage.objects;
create policy "attachments read own scope" on storage.objects for select using (
  bucket_id = 'attachments'
  and exists (
    select 1 from public.attachments a where a.storage_path = storage.objects.name
  )
);

-- ── writing ─────────────────────────────────────────────────────────────────
-- The row does not exist yet, so the path is what is checked: you may write
-- under a deal or a tender you can see, and nowhere else.
drop policy if exists "authenticated write attachments" on storage.objects;
drop policy if exists "attachments write own scope" on storage.objects;
create policy "attachments write own scope" on storage.objects for insert with check (
  bucket_id = 'attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (
    (
      (storage.foldername(name))[1] = 'deal'
      and exists (
        select 1 from public.deals d
        where d.id::text = (storage.foldername(name))[2]
      )
    )
    or (
      (storage.foldername(name))[1] = 'tender'
      and exists (
        select 1 from public.tenders t
        where t.id::text = (storage.foldername(name))[2]
      )
    )
  )
);

-- ── deleting ────────────────────────────────────────────────────────────────
-- Whoever may delete the row may delete the bytes, and nobody else. Seeing an
-- attachment is not the same as being allowed to remove it: a partner can read
-- what we attached to their deal without being able to take it away.
drop policy if exists "authenticated delete attachments" on storage.objects;
drop policy if exists "attachments delete own scope" on storage.objects;
create policy "attachments delete own scope" on storage.objects for delete using (
  bucket_id = 'attachments'
  and exists (
    select 1 from public.attachments a
    where a.storage_path = storage.objects.name
      and (
        a.uploaded_by = auth.uid()
        or exists (select 1 from public.profiles p
                   where p.id = auth.uid() and p.role = 'admin')
      )
  )
);

-- ── the metadata row ────────────────────────────────────────────────────────
-- Insert was "any authenticated user, as yourself", which let a row be filed
-- against a deal the writer cannot see. Harmless in practice — they could not
-- read it back — but a row nobody can see is a row nobody can clean up, and the
-- same check the bucket now makes costs nothing here.
drop policy if exists "attachments insert" on public.attachments;
create policy "attachments insert" on public.attachments for insert with check (
  uploaded_by = auth.uid()
  and (
    (entity_type = 'deal'   and exists (select 1 from public.deals   d where d.id = entity_id))
    or (entity_type = 'tender' and exists (select 1 from public.tenders t where t.id = entity_id))
  )
);

-- Signed in as a partner, this returns only attachments on their own deals.
select a.entity_type, a.file_name, a.created_at
from public.attachments a order by a.created_at desc limit 20;
