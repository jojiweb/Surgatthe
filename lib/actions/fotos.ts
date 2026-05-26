"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PhotoAlbum } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { deletePhoto as storageDelete } from "@/lib/storage";

const PhotoCreateSchema = z.object({
  obraId: z.string().uuid(),
  storagePath: z.string().min(1),
  album: z.nativeEnum(PhotoAlbum),
  caption: z.string().optional().nullable(),
  isPortfolio: z.boolean().optional().default(false),
});

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
  revalidatePath(`/obras/${data.obraId}`);
}

export async function deletePhotoById(id: string) {
  await requireUser();
  const photo = await prisma.obraPhoto.delete({ where: { id } });
  try {
    await storageDelete(photo.storagePath);
  } catch {
    // arquivo pode nao existir mais - segue o jogo
  }
  revalidatePath(`/obras/${photo.obraId}`);
}

export async function togglePortfolio(id: string, isPortfolio: boolean) {
  await requireUser();
  const photo = await prisma.obraPhoto.update({
    where: { id },
    data: { isPortfolio },
  });
  revalidatePath(`/obras/${photo.obraId}`);
}
