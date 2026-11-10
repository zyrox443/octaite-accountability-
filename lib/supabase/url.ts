// Accepts the project URL even if it was pasted with a path such as
// "/rest/v1/" (the form shown on Supabase's Data API page) or a trailing slash.
const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();

function normalize(value: string): string {
  if (!value) return value;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
  } catch {
    return value;
  }
}

export const SUPABASE_URL = normalize(raw);
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
