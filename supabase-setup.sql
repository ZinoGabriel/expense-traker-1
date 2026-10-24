create table if not exists public.user_data (
    user_id uuid primary key references auth.users (id) on delete cascade,
    expenses jsonb not null default '[]'::jsonb,
    preferences jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_data
    add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.user_data enable row level security;
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "Users can read their own expense history" on public.user_data;
create policy "Users can read their own expense history"
    on public.user_data for select
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own expense history" on public.user_data;
create policy "Users can create their own expense history"
    on public.user_data for insert
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own expense history" on public.user_data;
create policy "Users can update their own expense history"
    on public.user_data for update
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own expense history" on public.user_data;
create policy "Users can delete their own expense history"
    on public.user_data for delete
    using ((select auth.uid()) = user_id);