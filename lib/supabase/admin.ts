/**
 * Cliente Supabase com service role.
 * SO use em server actions / route handlers. NUNCA exponha no browser.
 * Bypassa RLS - usado para gerar signed URLs e operacoes admin do Storage.
 */
import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL precisam estar definidos"
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
