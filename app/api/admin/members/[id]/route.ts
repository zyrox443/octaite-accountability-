import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

// Update a member: name, title, password, or activate / deactivate.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireAdmin();
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin, userId } = guard;
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));

    const profilePatch: Record<string, unknown> = {};
    if (typeof body.full_name === "string") {
      if (!body.full_name.trim()) return NextResponse.json({ error: "Name is required.", field: "full_name" }, { status: 400 });
      profilePatch.full_name = body.full_name.trim();
    }
    if (typeof body.title === "string") profilePatch.title = body.title.trim();
    if (typeof body.is_active === "boolean") {
      if (id === userId && !body.is_active) {
        return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
      }
      profilePatch.is_active = body.is_active;
    }

    const authPatch: { password?: string; ban_duration?: string } = {};
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters.", field: "password" }, { status: 400 });
      }
      authPatch.password = body.password;
    }
    // Deactivated members are also blocked at the login level.
    if (typeof body.is_active === "boolean") authPatch.ban_duration = body.is_active ? "none" : "876000h";

    if (Object.keys(authPatch).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (Object.keys(profilePatch).length) {
      const { error } = await admin.from("profiles").update(profilePatch).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
