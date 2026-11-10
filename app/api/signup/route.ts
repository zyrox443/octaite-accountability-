import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_AVATAR = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// Public sign-up. The account is created INACTIVE: the person cannot sign in
// or see anything until the admin approves them on the Team page.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const full_name = String(form.get("full_name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const title = String(form.get("title") ?? "").trim().slice(0, 200);
    const avatar = form.get("avatar");

    const bad = (error: string, field?: string) => NextResponse.json({ error, field }, { status: 400 });
    if (!full_name || full_name.length > 80) return bad("Enter your full name.", "full_name");
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad("Enter a valid email address.", "email");
    if (password.length < 8) return bad("Password must be at least 8 characters.", "password");
    if (!title) return bad("Choose at least one role.", "title");
    let ext = "";
    if (avatar instanceof File && avatar.size > 0) {
      ext = IMAGE_TYPES[avatar.type] ?? "";
      if (!ext) return bad("The profile picture must be a PNG, JPG, WebP or GIF image.", "avatar");
      if (avatar.size > MAX_AVATAR) return bad("The profile picture must be smaller than 2 MB.", "avatar");
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return bad(exists ? "An account with this email already exists. Try signing in." : (error?.message ?? "Could not create the account."), exists ? "email" : undefined);
    }
    const id = data.user.id;

    let avatar_url: string | null = null;
    if (ext && avatar instanceof File) {
      const path = `${id}/avatar-${Date.now()}.${ext}`;
      const up = await admin.storage.from("avatars").upload(path, avatar, { contentType: avatar.type, upsert: true });
      if (!up.error) avatar_url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id, email, full_name, title, avatar_url, role: "member", is_active: false, pending_approval: true });
    if (pErr) {
      await admin.auth.admin.deleteUser(id);
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    // Tell every admin that someone is waiting.
    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
    if (admins?.length) {
      await admin.from("notifications").insert(
        admins.map((a) => ({
          recipient_id: a.id,
          type: "signup_request",
          subject_user_id: id,
          title: "New sign-up to approve",
          body: `${full_name} (${title}) created an account and is waiting for your approval.`,
        })),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
