import { PhotoAlbum } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSignedUrls, thumbPath } from "@/lib/storage";
import { cached, TAGS } from "./cache";

export type PhotoWithUrls = {
  id: string;
  storagePath: string;
  album: PhotoAlbum;
  caption: string | null;
  isPortfolio: boolean;
  thumbUrl: string | null;
  fullUrl: string | null;
};

/**
 * Fotos de uma obra com signed URLs de thumb e full geradas em batch.
 * Cacheado 50min (< 1h do token). Invalidado por upload/delete -> tag.
 */
export const getObraPhotosCached = (obraId: string) =>
  cached(
    async (): Promise<PhotoWithUrls[]> => {
      const photos = await prisma.obraPhoto.findMany({
        where: { obraId },
        orderBy: { createdAt: "desc" },
      });
      if (photos.length === 0) return [];

      // Pede thumbs + originais num unico round-trip ao Storage.
      const fullPaths = photos.map((p) => p.storagePath);
      const thumbPaths = fullPaths.map(thumbPath);
      const urls = await getSignedUrls([...fullPaths, ...thumbPaths]);

      return photos.map((p) => ({
        id: p.id,
        storagePath: p.storagePath,
        album: p.album,
        caption: p.caption,
        isPortfolio: p.isPortfolio,
        fullUrl: urls[p.storagePath] ?? null,
        thumbUrl: urls[thumbPath(p.storagePath)] ?? urls[p.storagePath] ?? null,
      }));
    },
    ["fotos-by-obra", obraId],
    [TAGS.fotos(obraId)],
    50 * 60 // 50 min < 1h TTL da signed URL
  )();
