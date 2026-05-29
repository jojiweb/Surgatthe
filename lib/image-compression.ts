"use client";

/**
 * Wrapper sobre browser-image-compression. A lib eh PESADA (~50kb),
 * por isso eh importada dinamicamente (lazy) so quando ha upload -
 * sai do bundle inicial do dia-stepper/photos-tab.
 */

const FULL_OPTS = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.8,
  fileType: "image/jpeg" as const,
};

const THUMB_OPTS = {
  maxSizeMB: 0.05,
  maxWidthOrHeight: 400,
  useWebWorker: true,
  initialQuality: 0.7,
  fileType: "image/jpeg" as const,
};

async function loadLib() {
  const mod = await import("browser-image-compression");
  return mod.default;
}

export async function compressImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const imageCompression = await loadLib();
  const compressed = await imageCompression(file, {
    ...FULL_OPTS,
    onProgress: onProgress ? (p) => onProgress(p) : undefined,
  });
  const name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  return new File([compressed], name, { type: "image/jpeg" });
}

export async function compressThumbnail(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const imageCompression = await loadLib();
  const compressed = await imageCompression(file, THUMB_OPTS);
  const name = file.name.replace(/\.[^/.]+$/, "") + "_thumb.jpg";
  return new File([compressed], name, { type: "image/jpeg" });
}
