"use client";

/**
 * UPLOAD DE FOTOS - helper unico do app.
 *
 * Por que centralizar: a logica antes era duplicada em photos-tab.tsx
 * e dia-stepper.tsx, ambas sequenciais (await por foto). Agora todo
 * upload do app passa por aqui, com 3 ganhos:
 *
 *   1. PARALELISMO controlado (pool de N): comprime+sobe varias fotos
 *      ao mesmo tempo sem travar memoria de celular fraco.
 *   2. THUMB gerada junto: cada foto vai como original + thumb (~30KB)
 *      para o grid carregar leve.
 *   3. Lazy import da lib de compressao - sai do bundle inicial.
 *
 * O componente chamador so passa os arquivos e recebe progresso.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, buildPhotoPath, thumbPath } from "@/lib/storage";

export type UploadedPhoto = {
  storagePath: string;
  thumbPath: string;
};

export type UploadOptions = {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

export async function uploadPhotos(
  supabase: SupabaseClient,
  obraId: string,
  files: File[],
  opts: UploadOptions = {}
): Promise<UploadedPhoto[]> {
  const { concurrency = 3, onProgress } = opts;
  const { compressImage, compressThumbnail } = await import(
    "@/lib/image-compression"
  );

  const results: UploadedPhoto[] = new Array(files.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= files.length) return;
      const file = files[i];

      // Comprime full e thumb em paralelo (CPU sobreposta com IO).
      const [full, thumb] = await Promise.all([
        compressImage(file),
        compressThumbnail(file),
      ]);

      const storagePath = buildPhotoPath(obraId, full.name);
      const tPath = thumbPath(storagePath);

      // Sobe os dois em paralelo.
      const [fullRes, thumbRes] = await Promise.all([
        supabase.storage.from(BUCKET).upload(storagePath, full, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        }),
        supabase.storage.from(BUCKET).upload(tPath, thumb, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        }),
      ]);
      if (fullRes.error) throw fullRes.error;
      if (thumbRes.error) throw thumbRes.error;

      results[i] = { storagePath, thumbPath: tPath };
      done++;
      onProgress?.(done, files.length);
    }
  }

  const pool = Math.min(concurrency, files.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}
