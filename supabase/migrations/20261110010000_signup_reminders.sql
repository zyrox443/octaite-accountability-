-- =====================================================================
-- Update 2: self sign-up with admin approval, profile pictures,
-- reminder notifications. Run this AFTER the first migration.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists pending_approval boolean not null default false;

alter type public.notification_type add value if not exists 'reminder';
alter type public.notification_type add value if not exists 'signup_request';

-- Public bucket for profile pictures (2 MB, images only). Files are
-- written only by the server during sign-up, so no upload policy is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- Admin: send a reminder to a member, either about one overdue task or
-- (with no task) about planning their day.
create or replace function public.send_reminder(p_user_id uuid, p_task_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only the admin can send reminders.';
  end if;
  if p_task_id is not null then
    select * into t from public.tasks where id = p_task_id and user_id = p_user_id;
    if not found then
      raise exception 'Task not found.';
    end if;
    insert into public.notifications (recipient_id, type, task_id, subject_user_id, title, body)
    values (p_user_id, 'reminder'::public.notification_type, t.id, p_user_id, 'Reminder from admin',
            '"' || t.title || '" is past its due time. Please submit your proof now.');
  else
    insert into public.notifications (recipient_id, type, subject_user_id, title, body)
    values (p_user_id, 'reminder'::public.notification_type, p_user_id, 'Reminder from admin',
            'You have not planned your day yet. Please add your tasks for today.');
  end if;
end;
$$;
revoke execute on function public.send_reminder(uuid, uuid) from public, anon;
grant execute on function public.send_reminder(uuid, uuid) to authenticated;

-- Leaderboard now also returns the profile picture.
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
           coalesce(sum(t.estimated_hours), 0)::numeric,
           count(t.id)::integer,
           (count(t.id) filter (where not t.completed_late))::integer
    from public.profiles p
    left join public.tasks t
      on t.user_id = p.id and t.status = 'approved' and t.submitted_at >= period_start
    where p.role = 'member' and p.is_active
    group by p.id, p.full_name, p.title, p.avatar_url
    order by 5 desc, 6 desc, p.full_name;
end;
$$;
revoke execute on function public.get_leaderboard(text) from public, anon;
grant execute on function public.get_leaderboard(text) to authenticated;
