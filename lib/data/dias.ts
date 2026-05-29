import { prisma } from "@/lib/prisma";
import { cached, TAGS } from "./cache";

/**
 * Dias trabalhados em uma obra. Cacheado por obra.
 * Invalidado por createDayLog -> revalidateTag(TAGS.dias(obraId)).
 */
export const getDayLogsByObraCached = (obraId: string) =>
  cached(
    async () =>
      prisma.dayLogEntry.findMany({
        where: { obraId },
        select: {
          id: true,
          fraction: true,
          dailyRateSnapshot: true,
          dayLog: {
            select: { id: true, date: true, notes: true },
          },
          workers: {
            select: {
              member: { select: { id: true, name: true } },
            },
          },
          serviceProgress: {
            select: {
              metersCompleted: true,
              obraService: { select: { type: true } },
            },
          },
        },
        orderBy: { dayLog: { date: "desc" } },
      }),
    ["dias-by-obra", obraId],
    [TAGS.dias(obraId)]
  )();

export const getMembersCached = () =>
  cached(
    async () =>
      prisma.member.findMany({
        select: { id: true, name: true, dailyRate: true },
        orderBy: { name: "asc" },
      }),
    ["members"],
    [TAGS.members]
  )();
