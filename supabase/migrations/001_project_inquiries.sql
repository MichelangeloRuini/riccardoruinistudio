begin;

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.project_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name varchar(120) not null check (char_length(trim(name)) between 1 and 120),
  email varchar(254) not null check (char_length(trim(email)) between 3 and 254),
  company varchar(200) check (company is null or char_length(company) between 1 and 200),
  service varchar(64) check (
    service is null or service in (
      'Creative Direction',
      'Brand Identity',
      'Campaigns',
      'Films & Content',
      'Events & Experiences',
      'Publishing',
      'Other'
    )
  ),
  description varchar(5000) not null check (char_length(trim(description)) between 1 and 5000),
  budget varchar(64) check (
    budget is null or budget in (
      'Under €10K',
      '€10K–25K',
      '€25K–50K',
      '€50K–100K',
      '€100K+',
      'Prefer not to say'
    )
  ),
  status varchar(16) not null default 'new' check (status in ('new', 'read', 'archived'))
);

create index if not exists project_inquiries_created_at_idx
  on public.project_inquiries (created_at desc);

create index if not exists project_inquiries_status_created_at_idx
  on public.project_inquiries (status, created_at desc);

create table if not exists public.project_inquiry_rate_limits (
  key_hash char(64) primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null
);

create index if not exists project_inquiry_rate_limits_expires_at_idx
  on public.project_inquiry_rate_limits (expires_at);

alter table public.admin_users enable row level security;
alter table public.project_inquiries enable row level security;
alter table public.project_inquiry_rate_limits enable row level security;

-- Remove policies from an earlier Phase 1 draft before relocating their helper.
drop policy if exists "Admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Admins can update project inquiry status" on public.project_inquiries;
drop function if exists public.is_project_admin();

create or replace function private.is_project_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function private.is_project_admin() from public, anon;
grant execute on function private.is_project_admin() to authenticated;

drop policy if exists "Admins can read their membership" on public.admin_users;
create policy "Admins can read their membership"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can read project inquiries" on public.project_inquiries;
create policy "Admins can read project inquiries"
  on public.project_inquiries
  for select
  to authenticated
  using (private.is_project_admin());

drop policy if exists "Admins can update project inquiry status" on public.project_inquiries;
create policy "Admins can update project inquiry status"
  on public.project_inquiries
  for update
  to authenticated
  using (private.is_project_admin())
  with check (private.is_project_admin());

create or replace function public.check_project_inquiry_rate_limit(
  p_key_hash text,
  p_max_requests integer default 5,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
    or p_max_requests < 1
    or p_max_requests > 100
    or p_window_seconds < 60
    or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.project_inquiry_rate_limits (
    key_hash,
    window_started_at,
    request_count,
    expires_at
  ) values (
    p_key_hash,
    now(),
    1,
    now() + make_interval(secs => p_window_seconds)
  )
  on conflict (key_hash) do update set
    window_started_at = case
      when public.project_inquiry_rate_limits.expires_at <= now() then now()
      else public.project_inquiry_rate_limits.window_started_at
    end,
    request_count = case
      when public.project_inquiry_rate_limits.expires_at <= now() then 1
      else public.project_inquiry_rate_limits.request_count + 1
    end,
    expires_at = case
      when public.project_inquiry_rate_limits.expires_at <= now()
        then now() + make_interval(secs => p_window_seconds)
      else public.project_inquiry_rate_limits.expires_at
    end
  returning request_count into current_count;

  return current_count <= p_max_requests;
end;
$$;

revoke all on function public.check_project_inquiry_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_project_inquiry_rate_limit(text, integer, integer) to service_role;

revoke all on table public.admin_users from public, anon, authenticated, service_role;
grant select on table public.admin_users to authenticated;

revoke all on table public.project_inquiries from public, anon, authenticated, service_role;
grant select on table public.project_inquiries to authenticated;
grant update (status) on table public.project_inquiries to authenticated;
grant insert on table public.project_inquiries to service_role;

revoke all on table public.project_inquiry_rate_limits from public, anon, authenticated, service_role;
grant select, insert, update on table public.project_inquiry_rate_limits to service_role;

commit;
