-- =====================================================================
-- Update 3: task timers (actual hours), online presence, auto-discard
-- of running tasks when a member leaves, blocking reminders.
-- Run AFTER the first two migrations. Safe to run more than once.
-- =====================================================================

alter type public.task_status add value if not exists 'discarded';
alter type public.notification_type add value if not exists 'task_discarded';

-- Time tracking on tasks
alter table public.tasks add column if not exists started_at timestamptz;       -- set while the timer is running
alter table public.tasks add column if not exists first_started_at timestamptz;
alter table public.tasks add column if not exists worked_seconds integer not null default 0;
alter table public.tasks add column if not exists credited_hours numeric(5,2);  -- what the leaderboard counts
alter table public.tasks add column if not exists discarded_at timestamptz;

-- A member can only have one task running at a time.
create unique index if not exists tasks_one_running_idx on public.tasks (user_id) where started_at is not null;

alter table public.settings add column if not exists offline_grace_minutes integer not null default 3
  check (offline_grace_minutes between 1 and 120);

-- Presence: one row per user, refreshed by the open browser tab.
create table if not exists public.presence (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.presence enable row level security;
grant select on public.presence to authenticated;
drop policy if exists presence_select on public.presence;
create policy presence_select on public.presence for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Called by the open app every 30 seconds.
create or replace function public.heartbeat()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    return;
  end if;
  insert into public.presence (user_id, last_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now();
end;
$$;

-- Member: start (or resume) the timer on a task.
create or replace function public.start_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.';
  end if;
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.user_id <> auth.uid() then
    raise exception 'Task not found.';
  end if;
  if t.status::text not in ('pending', 'overdue') then
    raise exception 'This task cannot be started.';
  end if;
  if t.started_at is not null then
    return t;
  end if;
  if exists (select 1 from public.tasks where user_id = auth.uid() and started_at is not null) then
    raise exception 'Another task is already running. Pause it first.';
  end if;
  perform public.heartbeat();
  update public.tasks
  set started_at = now(), first_started_at = coalesce(first_started_at, now())
  where id = p_task_id
  returning * into t;
  return t;
end;
$$;

-- Member: pause the timer. Time worked so far is kept.
create or replace function public.pause_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.user_id <> auth.uid() then
    raise exception 'Task not found.';
  end if;
  if t.started_at is null then
    return t;
  end if;
  update public.tasks
  set worked_seconds = worked_seconds + greatest(0, extract(epoch from now() - started_at))::integer,
      started_at = null
  where id = p_task_id
  returning * into t;
  return t;
end;
$$;

-- Submit now also stops the timer and records the hours actually worked.
-- Credited hours = time worked, never more than the estimate.
create or replace function public.submit_task(p_task_id uuid, p_note text)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
  who text;
  total integer;
begin
  if not public.is_active_user() then
    raise exception 'Your account is not active.';
  end if;
  select * into t from public.tasks where id = p_task_id for update;
  if not found or t.user_id <> auth.uid() then
    raise exception 'Task not found.';
  end if;
  if t.status::text not in ('pending', 'overdue') then
    raise exception 'This task has already been submitted.';
  end if;
  total := t.worked_seconds
    + case when t.started_at is not null then greatest(0, extract(epoch from now() - t.started_at))::integer else 0 end;
  if total <= 0 then
    raise exception 'Start the task first so your working time is recorded.';
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
    worked_seconds   = total,
    started_at       = null,
    credited_hours   = greatest(0.01, least(estimated_hours, round(total / 3600.0, 2))),
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

-- Running tasks are discarded when their owner has been offline (app tab
-- closed) for longer than the grace period. The task stays on record as
-- "Discarded" so the admin can see it; it earns no hours.
create or replace function public.discard_abandoned_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare
  grace integer := coalesce((select offline_grace_minutes from public.settings where id = 1), 3);
  r record;
  n integer := 0;
begin
  for r in
    update public.tasks t
    set status = 'discarded'::public.task_status, discarded_at = now(), started_at = null, credited_hours = null
    where t.started_at is not null
      and t.status::text in ('pending', 'overdue')
      and not exists (
        select 1 from public.presence p
        where p.user_id = t.user_id and p.last_seen_at > now() - make_interval(mins => grace)
      )
    returning t.id, t.user_id, t.title
  loop
    n := n + 1;
    perform public.notify_admins('task_discarded'::public.notification_type, r.id, r.user_id, 'Task discarded',
      (select full_name from public.profiles where id = r.user_id)
        || ' closed the app while "' || r.title || '" was running. The task was discarded.');
    insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body)
    select r.user_id, 'task_discarded'::public.notification_type, r.id, r.user_id, 'Task discarded',
           '"' || r.title || '" was discarded because the app was closed while it was running.'
    where not exists (select 1 from public.profiles where id = r.user_id and role = 'admin');
  end loop;
  return n;
end;
$$;

create or replace function public.run_scheduled_checks()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.mark_overdue_tasks();
  perform public.discard_abandoned_tasks();
  perform public.check_no_plan();
end;
$$;

-- Leaderboard counts the hours actually worked (credited hours).
drop function if exists public.get_leaderboard(text);
create function public.get_leaderboard(p_period text default 'week')
returns table (
  user_id uuid, full_name text, title text, avatar_url text,
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
    select p.id, p.full_name, p.title, p.avatar_url,
           coalesce(sum(coalesce(t.credited_hours, t.estimated_hours)), 0)::numeric,
           count(t.id)::integer,
           (count(t.id) filter (where not t.completed_late))::integer
    from public.profiles p
    left join public.tasks t
      on t.user_id = p.id and t.status::text = 'approved' and t.submitted_at >= period_start
    where p.role = 'member' and p.is_active
    group by p.id, p.full_name, p.title, p.avatar_url
    order by 5 desc, 6 desc, p.full_name;
end;
$$;

revoke execute on function
  public.heartbeat(), public.start_task(uuid), public.pause_task(uuid),
  public.discard_abandoned_tasks(), public.get_leaderboard(text)
from public, anon;
grant execute on function
  public.heartbeat(), public.start_task(uuid), public.pause_task(uuid),
  public.discard_abandoned_tasks(), public.get_leaderboard(text), public.submit_task(uuid, text)
to authenticated;

-- Check every minute so discards and overdue marks are prompt.
select cron.unschedule(jobid) from cron.job where jobname = 'team-accountability-checks';
select cron.schedule('team-accountability-checks', '* * * * *', $$select public.run_scheduled_checks();$$);
