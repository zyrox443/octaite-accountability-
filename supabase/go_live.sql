-- =====================================================================
-- GO LIVE: removes all sample data and creates (or resets) the admin.
-- 1. Change the three values marked EDIT below.
-- 2. Paste into Supabase > SQL Editor and click Run.
-- Do not save your real password into this file on GitHub.
-- =====================================================================
do $$
declare
  admin_email    text := 'you@yourcompany.com';   -- EDIT
  admin_password text := 'change-this-password';  -- EDIT (at least 8 characters)
  admin_name     text := 'Your Name';             -- EDIT
  uid uuid;
begin
  if admin_password = 'change-this-password' or char_length(admin_password) < 8 then
    raise exception 'Set admin_email, admin_password and admin_name at the top first.';
  end if;
  admin_email := lower(btrim(admin_email));

  -- 1. Remove every sample account. Their tasks, proof records and
  --    notifications are removed with them.
  delete from auth.users where email like '%@example.com';

  -- 2. Remove anything left over from testing.
  delete from public.notifications;
  delete from public.tasks;

  -- 3. Create the admin, or reset the password if the email already exists.
  select id into uid from auth.users where email = admin_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      admin_email, extensions.crypt(admin_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', admin_name), now(), now(), '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', admin_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(admin_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        banned_until = null, updated_at = now()
    where id = uid;
  end if;

  insert into public.profiles (id, email, full_name, title, role, is_active, pending_approval)
  values (uid, admin_email, admin_name, 'CEO', 'admin', true, false)
  on conflict (id) do update set
    email = excluded.email, full_name = excluded.full_name, title = excluded.title,
    role = 'admin', is_active = true, pending_approval = false;

  raise notice 'Done. Admin: %  |  accounts left: %', admin_email, (select count(*) from public.profiles);
end $$;

select full_name, email, role, is_active from public.profiles order by role, full_name;
