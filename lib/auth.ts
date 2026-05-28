import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * getCurrentUser eh envolvido por React cache(): dentro de um mesmo
 * request (render do server component + todas as server actions chamadas
 * nele), supabase.auth.getUser() - que faz uma chamada de REDE a API de
 * Auth do Supabase - roda apenas UMA vez. Sem isso, cada requireUser()
 * em cascata (pagina -> action -> sub-action) custava um round-trip.
 */
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
