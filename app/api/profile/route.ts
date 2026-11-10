import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

const MAX_AVATAR = 2 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// A signed-in user updates their own name and profile picture.
// Roles and account status stay under the admin's control.
export async function PATCH(request: Request) {
  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: me } = await admin.from("profiles").select("is_active").eq("id", user.id).maybeSingle();
    if (!me?.is_active) return NextResponse.json({ error: "Your account is not active." }, { status: 403 });

    const form = await request.formData();
    const patch: Record<string, unknown> = {};

    if (form.has("full_name")) {
      const full_name = String(form.get("full_name") ?? "").trim();
      if (!full_name || full_name.length > 80) return NextResponse.json({ error: "Enter your full name.", field: "full_name" }, { status: 400 });
      patch.full_name = full_name;
    }

    const avatar = form.get("avatar");
    const removeAvatar = form.get("remove_avatar") === "1";
    if (avatar instanceof File && avatar.size > 0) {
      const ext = IMAGE_TYPES[avatar.type];
      if (!ext) return NextResponse.json({ error: "The picture must be a PNG, JPG, WebP or GIF image.", field: "avatar" }, { status: 400 });
      if (avatar.size > MAX_AVATAR) return NextResponse.json({ error: "The picture must be smaller than 2 MB.", field: "avatar" }, { status: 400 });
      const { data: old } = await admin.storage.from("avatars").list(user.id);
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await admin.storage.from("avatars").upload(path, avatar, { contentType: avatar.type, upsert: true });
      if (up.error) return NextResponse.json({ error: up.error.message, field: "avatar" }, { status: 400 });
      if (old?.length) await admin.storage.from("avatars").remove(old.map((f) => `${user.id}/${f.name}`));
      patch.avatar_url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    } else if (removeAvatar) {
      const { data: old } = await admin.storage.from("avatars").list(user.id);
      if (old?.length) await admin.storage.from("avatars").remove(old.map((f) => `${user.id}/${f.name}`));
      patch.avatar_url = null;
    }

    if (Object.keys(patch).length) {
      const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
