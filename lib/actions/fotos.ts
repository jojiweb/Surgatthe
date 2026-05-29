"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { PhotoAlbum } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { deletePhoto as storageDelete, thumbPath } from "@/lib/storage";
import { TAGS } from "@/lib/data/cache";

const PhotoCreateSchema = z.object({
  obraId: z.string().uuid(),
  storagePath: z.string().min(1),
  album: z.nativeEnum(PhotoAlbum),
  caption: z.string().optional().nullable(),
  isPortfolio: z.boolean().optional().default(false),
});

const PhotoBatchSchema = z.object({
  obraId: z.string().uuid(),
  album: z.nativeEnum(PhotoAlbum),
  caption: z.string().optional().nullable(),
  isPortfolio: z.boolean().optional().default(false),
  storagePaths: z.array(z.string().min(1)).min(1),
});

/**
 * Batch insert das fotos apos o upload paralelo no client.
 * Uma unica round-trip ao banco em vez de N server actions.
 */
export async function createPhotosBatch(
  input: z.input<typeof PhotoBatchSchema>
) {
  await requireUser();
  const data = PhotoBatchSchema.parse(input);
  await prisma.obraPhoto.createMany({
    data: data.storagePaths.map((storagePath) => ({
      obraId: data.obraId,
      storagePath,
      album: data.album,
      caption: data.caption ?? null,
      isPortfolio: data.isPortfolio,
    })),
  });
  revalidateTag(TAGS.fotos(data.obraId));
  revalidateTag(TAGS.obras);
  revalidateTag(TAGS.obra(data.obraId));
}

export async function createPhotoRecord(
  input: z.input<typeof PhotoCreateSchema>
) {
  await requireUser();
  const data = PhotoCreateSchema.parse(input);
  await prisma.obraPhoto.create({
    data: {
      obraId: data.obraId,
      storagePath: data.storagePath,
      album: data.album,
      caption: data.caption ?? null,
      isPortfolio: data.isPortfolio,
    },
  });
  revalidateTag(TAGS.fotos(data.obraId));
  revalidateTag(TAGS.obras);
  revalidateTag(TAGS.obra(data.obraId));
}

export async function deletePhotoById(id: string) {
  await requireUser();
  const photo = await prisma.obraPhoto.delete({ where: { id } });
  // Remove o arquivo e a thumb (se existir) - falhas silenciosas, o
  // registro ja saiu do banco.
  try {
    await storageDelete(photo.storagePath);
  } catch {}
  try {
    await storageDelete(thumbPath(photo.storagePath));
  } catch {}
  revalidateTag(TAGS.fotos(photo.obraId));
  revalidateTag(TAGS.obras);
  revalidateTag(TAGS.obra(photo.obraId));
}

export async function togglePortfolio(id: string, isPortfolio: boolean) {
  await requireUser();
  const photo = await prisma.obraPhoto.update({
    where: { id },
    data: { isPortfolio },
  });
  revalidateTag(TAGS.fotos(photo.obraId));
}
