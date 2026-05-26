"use client";

import imageCompression, { type Options } from "browser-image-compression";

const DEFAULTS: Options = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.8,
  fileType: "image/jpeg",
};

export async function compressImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const opts: Options = {
    ...DEFAULTS,
    onProgress: onProgress ? (p) => onProgress(p) : undefined,
  };
  const compressed = await imageCompression(file, opts);
  // garante extensao .jpg
  const name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  return new File([compressed], name, { type: "image/jpeg" });
}
