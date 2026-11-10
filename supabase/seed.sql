-- =====================================================================
-- Sample data: 1 admin + 4 members + sample tasks.
-- Run AFTER the migration. Every sample account uses the password
--   ChangeMe123!
-- Change the passwords (Team page) or delete these accounts before real use.
-- =====================================================================
do $$
declare
  pw text := 'ChangeMe123!';
  tz text := 'Asia/Karachi';
  today date := (now() at time zone 'Asia/Karachi')::date;
  u record;
  uid uuid;
  ids uuid[] := '{}';
  tid uuid;
  d date;
  i int;
begin
  for u in
    select * from (values
      ('ceo@example.com',    'Bashir Ahmed',  'Chief Executive Officer', 'admin'),
      ('editor@example.com', 'Ayesha Khan',   'Video Editor',            'member'),
      ('youtube@example.com','Bilal Hussain', 'YouTube Video Maker',     'member'),
      ('ghl@example.com',    'Sana Malik',    'GoHighLevel Expert',      'member'),
      ('ai@example.com',     'Omar Farooq',   'AI Engineer',             'member')
    ) as v(email, full_name, title, role)
  loop
    select id into uid from auth.users where email = u.email;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u.full_name), now(), now(), '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
    insert into public.profiles (id, email, full_name, title, role, is_active)
    values (uid, u.email, u.full_name, u.title, u.role::public.user_role, true)
    on conflict (id) do update set
      full_name = excluded.full_name, title = excluded.title,
      role = excluded.role, is_active = true, email = excluded.email;
    if u.role = 'member' then ids := ids || uid; end if;
  end loop;

  if exists (select 1 from public.tasks) then
    return; -- sample tasks already present
  end if;

  -- Approved history for the last 10 days (drives the leaderboard).
  for i in 1 .. array_length(ids, 1) loop
    for d in select generate_series(today - 10, today - 1, interval '1 day')::date loop
      continue when extract(isodow from d) = 7;
      insert into public.tasks (
        user_id, title, description, estimated_hours, planned_start_at, due_at, original_due_at,
        task_date, status, submitted_at, submission_note, completed_late, approved_at, went_overdue_at
      ) values (
        ids[i],
        (array['Edit client testimonial cut','Script and record weekly upload',
               'Build onboarding automation','Fine-tune support chatbot prompts'])[i],
        'Sample task created by the seed script.',
        (array[3.5, 2.5, 3, 2])[i] + ((extract(day from d)::int + i) % 3) * 0.5,
        (d + time '10:00') at time zone tz,
        (d + time '17:00') at time zone tz,
        (d + time '17:00') at time zone tz,
        d, 'approved',
        (d + case when (extract(day from d)::int + i) % 4 = 0 then time '19:10' else time '16:20' end) at time zone tz,
        'Finished and delivered. Link attached.',
        (extract(day from d)::int + i) % 4 = 0,
        (d + time '20:00') at time zone tz,
        case when (extract(day from d)::int + i) % 4 = 0 then (d + time '17:00') at time zone tz end
      ) returning id into tid;
      insert into public.task_proofs (task_id, user_id, kind, url)
      values (tid, ids[i], 'link', 'https://drive.google.com/file/d/sample-proof/view');
    end loop;
  end loop;

  -- Today: a mix of states.
  insert into public.tasks (user_id, title, description, estimated_hours, planned_start_at, due_at, original_due_at, task_date)
  values
    (ids[1], 'Colour grade product launch video', 'Final grade and export in 4K.', 3,
      (today + time '10:00') at time zone tz, (today + time '23:30') at time zone tz, (today + time '23:30') at time zone tz, today),
    (ids[1], 'Cut three short-form reels', 'Vertical cuts from the launch footage.', 2,
      (today + time '14:00') at time zone tz, (today + time '23:45') at time zone tz, (today + time '23:45') at time zone tz, today),
    (ids[2], 'Thumbnail and title for Friday upload', 'Three thumbnail options.', 1.5,
      (today + time '09:30') at time zone tz, (today + time '23:00') at time zone tz, (today + time '23:00') at time zone tz, today);

  -- Submitted, waiting for the admin.
  insert into public.tasks (user_id, title, description, estimated_hours, planned_start_at, due_at, original_due_at, task_date,
                            status, submitted_at, submission_note)
  values (ids[3], 'Set up lead nurture workflow in GHL', 'Five-step email and SMS sequence.', 4,
      (today + time '09:00') at time zone tz, (today + time '23:50') at time zone tz, (today + time '23:50') at time zone tz, today,
      'submitted', now() - interval '20 minutes', 'Workflow is live in the sub-account. Loom walkthrough attached.')
  returning id into tid;
  insert into public.task_proofs (task_id, user_id, kind, url)
  values (tid, ids[3], 'link', 'https://www.loom.com/share/sample-walkthrough');

  -- Overdue since yesterday (stays on the member's dashboard until done).
  insert into public.tasks (user_id, title, description, estimated_hours, planned_start_at, due_at, original_due_at, task_date)
  values (ids[2], 'Upload behind-the-scenes vlog', 'Edit, upload and schedule.', 2.5,
      ((today - 1) + time '11:00') at time zone tz, ((today - 1) + time '18:00') at time zone tz,
      ((today - 1) + time '18:00') at time zone tz, today - 1);

  perform public.mark_overdue_tasks();
  -- Omar (AI Engineer) has no tasks today, so he appears under "No plan today".
end $$;
