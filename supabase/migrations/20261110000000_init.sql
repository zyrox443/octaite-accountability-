-- =====================================================================
-- Team Accountability: full schema, RLS, storage policies and cron job.
-- Safe to run once on a fresh Supabase project (SQL Editor > Run).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member');
create type public.task_status as enum ('pending', 'submitted', 'approved', 'overdue');
create type public.proof_kind as enum ('file', 'link');
create type public.notification_type as enum
  ('task_overdue', 'task_submitted', 'task_approved', 'task_rejected', 'no_plan');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  title       text not null default '',
  role        public.user_role not null default 'member',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.settings (
  id              smallint primary key default 1 check (id = 1),
  company_name    text not null default 'Octaite',
  timezone        text not null default 'Asia/Karachi',
  no_plan_cutoff  time not null default '11:00',
  -- ISO weekday numbers (1 = Monday ... 7 = Sunday) on which the
  -- "no plan today" check runs.
  work_days       smallint[] not null default '{1,2,3,4,5,6}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
insert into public.settings (id) values (1);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  description       text not null default '',
  estimated_hours   numeric(4,2) not null check (estimated_hours > 0 and estimated_hours <= 24),
  planned_start_at  timestamptz not null,
  due_at            timestamptz not null,
  original_due_at   timestamptz not null,
  task_date         date not null,
  status            public.task_status not null default 'pending',
  went_overdue_at   timestamptz,
  submitted_at      timestamptz,
  submission_note   text,
  completed_late    boolean not null default false,
  approved_at       timestamptz,
  approved_by       uuid references public.profiles (id) on delete set null,
  rejection_reason  text,
  rejected_at       timestamptz,
  rejected_by       uuid references public.profiles (id) on delete set null,
  rejection_count   integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (due_at > planned_start_at)
);
create index tasks_user_id_idx      on public.tasks (user_id);
create index tasks_status_idx       on public.tasks (status);
create index tasks_due_at_idx       on public.tasks (due_at);
create index tasks_user_date_idx    on public.tasks (user_id, task_date);
create index tasks_pending_due_idx  on public.tasks (due_at) where status = 'pending';

create table public.task_proofs (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          public.proof_kind not null,
  storage_path  text,
  file_name     text,
  mime_type     text,
  size_bytes    bigint,
  url           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (
    (kind = 'file' and storage_path is not null and file_name is not null)
    or (kind = 'link' and url ~* '^https?://')
  )
);
create index task_proofs_task_id_idx on public.task_proofs (task_id);
create index task_proofs_user_id_idx on public.task_proofs (user_id);

create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  type             public.notification_type not null,
  task_id          uuid references public.tasks (id) on delete cascade,
  subject_user_id  uuid references public.profiles (id) on delete cascade,
  title            text not null,
  body             text not null default '',
  dedupe_key       text,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;
create unique index notifications_dedupe_idx
  on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_active
  );
$$;

create or replace function public.app_timezone()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.settings where id = 1), 'Asia/Karachi');
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger settings_updated_at      before update on public.settings      for each row execute function public.set_updated_at();
create trigger tasks_updated_at         before update on public.tasks         for each row execute function public.set_updated_at();
create trigger task_proofs_updated_at   before update on public.task_proofs   for each row execute function public.set_updated_at();
create trigger notifications_updated_at before update on public.notifications for each row execute function public.set_updated_at();

-- Every new auth user gets a profile. It starts as an INACTIVE member, so
-- even if somebody signs up through the public API they get no access
-- until the admin activates them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Task guards (accountability rules live here, not in the UI)
-- ---------------------------------------------------------------------
-- "Direct" means the statement came straight from a logged-in user through
-- the API. Our own SECURITY DEFINER functions, the cron job and the SQL
-- editor run as a privileged role and skip the member restrictions.
create or replace function public.tasks_guard_insert()
returns trigger language plpgsql set search_path = public as $$
declare
  tz text := public.app_timezone();
  direct boolean := current_user in ('authenticated', 'anon');
begin
  new.original_due_at := new.due_at;
  new.task_date := (new.planned_start_at at time zone tz)::date;

  if direct and not public.is_admin() then
    if new.user_id is distinct from auth.uid() then
      raise exception 'You can only create tasks for yourself.';
    end if;
    if new.due_at <= now() then
      raise exception 'The due time must be in the future.';
    end if;
    if new.task_date < (now() at time zone tz)::date then
      raise exception 'Tasks cannot be added for past days.';
    end if;
    new.status           := 'pending';
    new.went_overdue_at  := null;
    new.submitted_at     := null;
    new.submission_note  := null;
    new.completed_late   := false;
    new.approved_at      := null;
    new.approved_by      := null;
    new.rejection_reason := null;
    new.rejected_at      := null;
    new.rejected_by      := null;
    new.rejection_count  := 0;
  end if;
  return new;
end;
$$;

create or replace function public.tasks_guard_update()
returns trigger language plpgsql set search_path = public as $$
declare
  tz text := public.app_timezone();
  direct boolean := current_user in ('authenticated', 'anon');
begin
  -- The original due time is permanent for everyone.
  new.original_due_at := old.original_due_at;
  new.created_at := old.created_at;

  if not direct then
    return new;
  end if;

  if public.is_admin() then
    new.task_date := (new.planned_start_at at time zone tz)::date;
    -- When the admin moves a due time, keep the status honest.
    if new.due_at is distinct from old.due_at and new.status in ('pending', 'overdue') then
      if new.due_at > now() then
        new.status := 'pending';
        new.went_overdue_at := null;
      else
        new.status := 'overdue';
        new.went_overdue_at := coalesce(old.went_overdue_at, now());
      end if;
    end if;
    return new;
  end if;

  -- Members: only title and description, and only before submission.
  if old.status not in ('pending', 'overdue') then
    raise exception 'This task can no longer be edited.';
  end if;
  if (to_jsonb(new) - 'title' - 'description' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'title' - 'description' - 'updated_at') then
    raise exception 'Only the admin can change the due time, estimated hours or status of a task.';
  end if;
  return new;
end;
$$;

create trigger tasks_guard_insert before insert on public.tasks
  for each row execute function public.tasks_guard_insert();
create trigger tasks_guard_update before update on public.tasks
  for each row execute function public.tasks_guard_update();

-- ---------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------
create or replace function public.notify_admins(
  p_type public.notification_type, p_task_id uuid, p_subject uuid,
  p_title text, p_body text, p_dedupe text default null
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body, dedupe_key)
  select p.id, p_type, p_task_id, p_subject, p_title, p_body, p_dedupe
  from public.profiles p
  where p.role = 'admin' and p.is_active
  on conflict do nothing;
$$;

-- Member: submit a task for approval. Requires at least one proof.
create or replace function public.submit_task(p_task_id uuid, p_note text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
  who text;
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.';
  end if;
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.user_id <> auth.uid() then
    raise exception 'Task not found.';
  end if;
  if t.status not in ('pending', 'overdue') then
    raise exception 'This task has already been submitted.';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Add a short note describing what was done.';
  end if;
  if not exists (select 1 from public.task_proofs where task_id = p_task_id) then
    raise exception 'Attach at least one file or link as proof of work.';
  end if;

  update public.tasks set
    status           = 'submitted',
    submitted_at     = now(),
    submission_note  = btrim(p_note),
    completed_late   = (now() > due_at) or went_overdue_at is not null,
    rejection_reason = null,
    rejected_at      = null,
    rejected_by      = null
  where id = p_task_id
  returning * into t;

  select full_name into who from public.profiles where id = t.user_id;
  perform public.notify_admins('task_submitted', t.id, t.user_id,
    'Proof submitted', who || ' submitted "' || t.title || '" for approval.');
  return t;
end;
$$;

-- Admin: approve a submitted task.
create or replace function public.approve_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can approve tasks.';
  end if;
  update public.tasks set
    status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = p_task_id and status = 'submitted'
  returning * into t;
  if not found then
    raise exception 'This task is not awaiting approval.';
  end if;
  insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body)
  values (t.user_id, 'task_approved', t.id, t.user_id, 'Task approved',
          '"' || t.title || '" was approved.');
  return t;
end;
$$;

-- Admin: reject a submitted task with a reason. It returns to Pending,
-- or to Overdue if the due time has already passed.
create or replace function public.reject_task(p_task_id uuid, p_reason text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can reject tasks.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A rejection reason is required.';
  end if;
  update public.tasks set
    status           = case when due_at <= now() then 'overdue'::public.task_status
                            else 'pending'::public.task_status end,
    went_overdue_at  = case when due_at <= now() then coalesce(went_overdue_at, now())
                            else went_overdue_at end,
    submitted_at     = null,
    completed_late   = false,
    rejection_reason = btrim(p_reason),
    rejected_at      = now(),
    rejected_by      = auth.uid(),
    rejection_count  = rejection_count + 1
  where id = p_task_id and status = 'submitted'
  returning * into t;
  if not found then
    raise exception 'This task is not awaiting approval.';
  end if;
  insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body)
  values (t.user_id, 'task_rejected', t.id, t.user_id, 'Task rejected',
          '"' || t.title || '" was rejected: ' || btrim(p_reason));
  return t;
end;
$$;

-- Marks every Pending task past its due time as Overdue and raises
-- notifications. Called by pg_cron every 5 minutes and on page load.
create or replace function public.mark_overdue_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    update public.tasks t set status = 'overdue', went_overdue_at = now()
    where t.status = 'pending' and t.due_at <= now()
    returning t.id, t.user_id, t.title
  loop
    n := n + 1;
    perform public.notify_admins('task_overdue', r.id, r.user_id, 'Task overdue',
      (select full_name from public.profiles where id = r.user_id)
        || ' missed the due time for "' || r.title || '".',
      'overdue:' || r.id);
    insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body, dedupe_key)
    select r.user_id, 'task_overdue', r.id, r.user_id, 'Task overdue',
           '"' || r.title || '" is past its due time. Submit proof to complete it.',
           'overdue:' || r.id
    where not exists (select 1 from public.profiles where id = r.user_id and role = 'admin')
    on conflict do nothing;
  end loop;
  return n;
end;
$$;

-- Flags active members with no tasks planned for today once the cutoff
-- has passed. One alert per member per day.
create or replace function public.check_no_plan()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  local_now timestamp;
  r record;
  n integer := 0;
begin
  select * into s from public.settings where id = 1;
  local_now := now() at time zone s.timezone;
  if local_now::time < s.no_plan_cutoff
     or not (extract(isodow from local_now)::smallint = any (s.work_days)) then
    return 0;
  end if;
  for r in
    select p.id, p.full_name from public.profiles p
    where p.role = 'member' and p.is_active
      and not exists (
        select 1 from public.tasks t
        where t.user_id = p.id and t.task_date = local_now::date
      )
  loop
    n := n + 1;
    perform public.notify_admins('no_plan', null, r.id, 'No plan today',
      r.full_name || ' has not added any tasks for today.',
      'no_plan:' || r.id || ':' || local_now::date);
  end loop;
  return n;
end;
$$;

create or replace function public.run_scheduled_checks()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.mark_overdue_tasks();
  perform public.check_no_plan();
end;
$$;

-- Leaderboard: hours = sum of estimated hours of APPROVED tasks, counted
-- in the period the work was submitted. Visible to every active user.
create or replace function public.get_leaderboard(p_period text default 'week')
returns table (
  user_id uuid, full_name text, title text,
  hours numeric, tasks_completed integer, on_time_count integer
) language plpgsql stable security definer set search_path = public as $$
declare
  tz text := public.app_timezone();
  local_now timestamp := now() at time zone tz;
  period_start timestamptz;
begin
  if not public.is_active_user() then
    raise exception 'Not allowed.';
  end if;
  period_start := case p_period
    when 'week'  then date_trunc('week',  local_now) at time zone tz
    when 'month' then date_trunc('month', local_now) at time zone tz
    else '-infinity'::timestamptz
  end;
  return query
    select p.id, p.full_name, p.title,
           coalesce(sum(t.estimated_hours), 0)::numeric,
           count(t.id)::integer,
           (count(t.id) filter (where not t.completed_late))::integer
    from public.profiles p
    left join public.tasks t
      on t.user_id = p.id and t.status = 'approved' and t.submitted_at >= period_start
    where p.role = 'member' and p.is_active
    group by p.id, p.full_name, p.title
    order by 4 desc, 5 desc, p.full_name;
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;
grant select                         on public.profiles      to authenticated;
grant update (full_name, title, role, is_active, email) on public.profiles to authenticated;
grant select, update                 on public.settings      to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, delete         on public.task_proofs   to authenticated;
grant select, delete                 on public.notifications to authenticated;
grant update (read_at)               on public.notifications to authenticated;

grant execute on function
  public.is_admin(), public.is_active_user(), public.app_timezone(),
  public.submit_task(uuid, text), public.approve_task(uuid),
  public.reject_task(uuid, text), public.mark_overdue_tasks(),
  public.get_leaderboard(text)
to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.settings      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_proofs   enable row level security;
alter table public.notifications enable row level security;

-- profiles: you see yourself; the admin sees and manages everyone.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- settings: readable by active users, changed only by the admin.
create policy settings_select on public.settings for select to authenticated
  using (public.is_active_user());
create policy settings_admin_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tasks: members work only with their own; the admin with all.
create policy tasks_select on public.tasks for select to authenticated
  using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy tasks_update on public.tasks for update to authenticated
  using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin())
  with check ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy tasks_admin_delete on public.tasks for delete to authenticated
  using (public.is_admin());

-- task_proofs: members add/remove proof only on their own open tasks.
create policy proofs_select on public.task_proofs for select to authenticated
  using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());
create policy proofs_insert on public.task_proofs for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_active_user()
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
        and t.status in ('pending', 'overdue')
    )
    and (kind = 'link' or storage_path like auth.uid()::text || '/' || task_id::text || '/%')
  );
create policy proofs_delete on public.task_proofs for delete to authenticated
  using (
    public.is_admin()
    or (user_id = auth.uid() and public.is_active_user() and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.status in ('pending', 'overdue')
    ))
  );

-- notifications: strictly your own.
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage: private "proofs" bucket, one folder per user per task
--   proofs/{user_id}/{task_id}/{file}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('proofs', 'proofs', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy proofs_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );
create policy proofs_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'proofs'
    and (
      public.is_admin()
      or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_user())
    )
  );
create policy proofs_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'proofs'
    and (
      public.is_admin()
      or ((storage.foldername(name))[1] = auth.uid()::text and public.is_active_user())
    )
  );

-- ---------------------------------------------------------------------
-- Realtime: live updates for the dashboard, approvals and the bell
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.task_proofs;
alter publication supabase_realtime add table public.profiles;

-- ---------------------------------------------------------------------
-- pg_cron: every 5 minutes
-- ---------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'team-accountability-checks';
select cron.schedule(
  'team-accountability-checks',
  '*/5 * * * *',
  $$select public.run_scheduled_checks();$$
);
