import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";

// Create a member account. Only the admin can call this.
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin();
    if ("error" in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin } = guard;

    const body = await request.json().catch(() => ({}));
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const title = String(body.title ?? "").trim();
    const password = String(body.password ?? "");

    if (!full_name) return NextResponse.json({ error: "Name is required.", field: "full_name" }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address.", field: "email" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters.", field: "password" }, { status: 400 });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return NextResponse.json(
        { error: exists ? "An account with this email already exists." : (error?.message ?? "Could not create the account."), field: exists ? "email" : undefined },
        { status: 400 },
      );
    }
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: data.user.id, email, full_name, title, role: "member", is_active: true });
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    return NextResponse.json({ id: data.user.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
