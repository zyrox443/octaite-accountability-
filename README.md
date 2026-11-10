# Octaite Accountability

A daily accountability app for a small team. Members plan their day, upload proof of work, and the admin approves it. Approved hours feed a leaderboard.

- **Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Auth, Postgres, Storage, Row Level Security, Realtime, pg_cron)
- **Timezone:** Asia/Karachi (PKT) for every date and for the meaning of "today"

## What is in this folder

| Path | What it is |
|---|---|
| `supabase/migrations/20261110000000_init.sql` | The whole database: tables, security rules, storage bucket and policies, the 5-minute cron job |
| `supabase/migrations/20261110010000_signup_reminders.sql` | Update 2: sign-up with approval, profile pictures, reminders |
| `supabase/seed.sql` | Sample data: 1 admin, 4 members, sample tasks |
| `.env.example` | The three keys the app needs |
| `app/`, `components/`, `lib/` | The application code |

---

## Setup, step by step

You need a free [Supabase](https://supabase.com) account, a free [Vercel](https://vercel.com) account, and (only to run it on your own computer) [Node.js 20 or newer](https://nodejs.org).

### 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Give it a name (for example `octaite-accountability`), set a database password and save it somewhere safe.
3. Choose the region closest to Pakistan (Mumbai or Singapore) and click **Create new project**. Wait about 2 minutes.

### 2. Enable pg_cron

pg_cron is what marks tasks as Overdue every 5 minutes.

1. In the left sidebar open **Database** > **Extensions**.
2. Search for `pg_cron` and switch it **on**.

(The SQL in the next step also tries to enable it, so if you forget this step it normally still works.)

### 3. Run the SQL

1. In the left sidebar open **SQL Editor** and click **New query**.
2. Open `supabase/migrations/20261110000000_init.sql` from this folder, copy everything, paste it into the editor and click **Run**. You should see "Success".
3. Click **New query** again and do the same with `supabase/migrations/20261110010000_signup_reminders.sql`.
4. Click **New query** again. Copy everything from `supabase/seed.sql`, paste and **Run** (optional sample data).

Run the migration only once. If you ever need to start again, the simplest way is to create a fresh Supabase project.

### 4. Check the storage bucket

The SQL already created a private bucket called `proofs` with a 50 MB file limit and its access rules. To confirm:

1. Open **Storage** in the sidebar. You should see a bucket named **proofs** marked as private.
2. If it is missing, click **New bucket**, name it exactly `proofs`, leave **Public bucket** off, set the file size limit to 50 MB, and save. Then run the migration's "Storage" section again.

### 5. Turn off public sign-up

Team members sign up through the app's own sign-up page, which goes through the server, so Supabase's public sign-up can stay off.

1. Open **Authentication** > **Sign In / Providers** (on some dashboards: **Authentication** > **Settings**).
2. Switch **Allow new users to sign up** off and save.

The app's sign-up page keeps working with this switched off.

### 6. Copy your keys

1. Open **Project Settings** > **API** (and **API Keys**).
2. You need three values:
   - **Project URL**
   - the **anon** key (also called the publishable key)
   - the **service_role** key (also called the secret key). Keep this one private. It is only used on the server.

### 7. Run it on your computer (optional)

```bash
npm install
```

Copy `.env.example` to a new file named `.env.local` and fill in the three values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

```bash
npm run dev
```

Open <http://localhost:3000>.

### 8. Sign in with the sample accounts

Every sample account uses the password `ChangeMe123!`

| Email | Person | Role |
|---|---|---|
| `ceo@example.com` | Bashir Ahmed | Admin |
| `editor@example.com` | Ayesha Khan | Video Editor |
| `youtube@example.com` | Bilal Hussain | YouTube Video Maker |
| `ghl@example.com` | Sana Malik | GoHighLevel Expert |
| `ai@example.com` | Omar Farooq | AI Engineer |

### 9. Switch to your real accounts

1. **Your own admin login.** In Supabase open **Authentication** > **Users** > **Add user**, enter your real email and a password, and tick **Auto Confirm User**. Then in the **SQL Editor** run (with your email and name):

   ```sql
   update public.profiles
   set role = 'admin', is_active = true, full_name = 'Your Name', title = 'CEO'
   where email = 'you@yourcompany.com';
   ```

2. Send your team the sign-up link: your site address followed by `/signup`. Each person enters their name, email, password, an optional profile picture and their role or roles. You get a bell notification, and they cannot sign in until you click **Approve** on the **Team** page. You can also create accounts yourself with **Add member**.
3. Remove the sample people and their sample tasks. In the SQL Editor run:

   ```sql
   delete from auth.users where email like '%@example.com';
   ```

### 10. Deploy to Vercel

1. Put this folder in a GitHub repository (GitHub Desktop is the easiest way if you do not use the command line).
2. Go to <https://vercel.com/new>, import the repository. Vercel detects Next.js automatically; leave the build settings as they are.
3. Before clicking **Deploy**, open **Environment Variables** and add the same three values from step 7:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Click **Deploy**. After about a minute you get your live address.
5. In Supabase open **Authentication** > **URL Configuration** and set **Site URL** to that Vercel address.

---

## How it works

### Roles
- **Admin** lands on the Dashboard, sees everything, approves or rejects proof, edits or deletes any task, and manages members.
- **Member** sees and works with only their own tasks.

These rules are enforced inside the database (Row Level Security and triggers), not only in the screens.

### Task lifecycle

```
Pending -> Submitted -> Approved
Pending -> Overdue -> Submitted -> Approved   (marked "Late")
Submitted -> Rejected -> back to Pending (or Overdue if the due time has passed)
```

- Once a member adds a task they cannot change its due time or estimated hours, and cannot delete it. They can still fix the title and description before submitting.
- A task cannot be submitted without at least one file or link, plus a short note.
- "Rejected" is shown as a badge with the reason; in the database the task is back in Pending or Overdue.
- The original due time is stored permanently next to the current due time and the actual completion time.

### Overdue and "no plan" checks
- pg_cron runs `run_scheduled_checks()` every 5 minutes. It marks late Pending tasks as Overdue and writes a notification for the admin (and the member).
- The same check also runs whenever My Day or the Dashboard opens, so the screen is never stale.
- After the cutoff time (11:00 AM PKT by default, editable in **Settings**) members with no tasks for today are listed under **No plan today** and the admin gets one alert per member per day. The alert only fires on the working days chosen in Settings (Monday to Saturday by default).

### Reminders and reports
- On the Dashboard, **Remind** next to an overdue task or a member with no plan sends that member a bell notification. **Remind all** covers everyone with no plan.
- On a member's page, **Download report (PDF)** and **CSV** export their tasks, hours and on-time record for the chosen date range.
- A member can have several job roles. Edit them on the **Team** page.

### Leaderboard
- Hours = the sum of estimated hours of **approved** tasks only.
- A task counts in the week or month in which the member **submitted** it, so a slow approval never moves hours into a different period.
- On-time % = approved tasks that were submitted before their due time.

### Proof files
- Stored in the private `proofs` bucket under `user-id/task-id/file`.
- Members can upload into and read only their own folder. The admin can read everything. Files are shown through signed links that expire after one hour.
- Maximum 50 MB per file. For anything larger, add a Google Drive, YouTube or Frame.io link.

## Design notes
- Light and dark mode with a toggle in the top bar. The choice is remembered on each device and follows the system setting on first visit.
- Rounded cards and pills, soft shadows, amber gradient highlights and spring-based motion.
- Small amber text uses `#B45309` in light mode. The brand amber `#D97706` is used for fills, borders and large figures, because on a white background it does not reach the WCAG AA contrast ratio for small text.

## Troubleshooting

| Problem | Fix |
|---|---|
| "This account is not active" at login | The profile is inactive. As admin open **Team** > **Edit** > **Reactivate**. |
| Adding a member fails with a server error | `SUPABASE_SERVICE_ROLE_KEY` is missing or wrong in `.env.local` or in Vercel. Redeploy after fixing it. |
| Tasks do not turn Overdue on their own | Check **Database** > **Extensions** that `pg_cron` is on, then in SQL Editor run `select * from cron.job;` and look for `team-accountability-checks`. |
| Uploads fail | Check the `proofs` bucket exists and is private (step 4). |
| The dashboard does not update live | In Supabase open **Database** > **Publications** > `supabase_realtime` and confirm `tasks`, `notifications`, `task_proofs` and `profiles` are included. |
