import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./url";

let client: SupabaseClient | undefined;

export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );
  }
  return client;
}
