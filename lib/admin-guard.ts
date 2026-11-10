import { supabaseAdmin, supabaseServer } from "./supabase/server";

/** Confirms the caller is a signed-in, active admin. Returns the service client. */
export async function requireAdmin() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in.", status: 401 as const };
  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return { error: "Only the admin can do this.", status: 403 as const };
  }
  return { admin, userId: user.id };
}
