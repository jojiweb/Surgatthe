/**
 * Abstracoes sobre o Storage do Supabase (bucket privado "obra-fotos").
 *
 * Upload eh feito do BROWSER usando o client autenticado (respeitando
 * a sessao do usuario). Signed URLs sao geradas no SERVIDOR com
 * service role - elas tem validade curta (1h) e sao regeradas a cada
 * carregamento de pagina.
 */
import { adminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "obra-fotos";
const SIGNED_URL_TTL = 60 * 60; // 1 hora

function randomId() {
  // crypto.randomUUID disponivel no browser e no Node 19+
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function buildPhotoPath(obraId: string, fileName: string): string {
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "jpg";
  return `${obraId}/${randomId()}.${ext}`;
}

/**
 * Convencao: para cada storagePath "{obraId}/{uuid}.jpg" existe um
 * thumbnail em "{obraId}/{uuid}_thumb.jpg". Manter o calculo em UM
 * lugar so para nao desincronizar.
 */
export function thumbPath(storagePath: string): string {
  const dot = storagePath.lastIndexOf(".");
  if (dot === -1) return `${storagePath}_thumb`;
  return `${storagePath.slice(0, dot)}_thumb${storagePath.slice(dot)}`;
}

/**
 * Upload do BROWSER. Recebe o supabase client autenticado.
 */
export async function uploadPhotoFromBrowser(
  supabase: SupabaseClient,
  obraId: string,
  file: File
): Promise<{ path: string }> {
  const path = buildPhotoPath(obraId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;
  return { path };
}

/**
 * Gera signed URL no SERVIDOR. Use em server components antes de
 * passar fotos para client components.
 */
export async function getSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function getSignedUrls(
  paths: string[]
): Promise<Record<string, string | null>> {
  if (paths.length === 0) return {};
  const { data, error } = await adminClient()
    .storage.from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  const map: Record<string, string | null> = {};
  if (error || !data) {
    paths.forEach((p) => (map[p] = null));
    return map;
  }
  data.forEach((d) => {
    if (d.path) map[d.path] = d.signedUrl ?? null;
  });
  return map;
}

/**
 * Delete usando service role - chamar so de server actions.
 */
export async function deletePhoto(path: string): Promise<void> {
  const { error } = await adminClient().storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
