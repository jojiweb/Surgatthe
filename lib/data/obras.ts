import { ObraStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached, TAGS } from "./cache";

/**
 * Leituras de Obra cacheadas com tag.
 * Invalidadas por: createObra/updateObra/deleteObra -> revalidateTag("obras")
 *                  + revalidateTag(TAGS.obra(id)) quando especifico.
 */

export const getObrasCached = (status?: ObraStatus) =>
  cached(
    async () => {
      const where: Prisma.ObraWhereInput = {};
      if (status) where.status = status;
      return prisma.obra.findMany({
        where,
        select: {
          id: true,
          clientName: true,
          address: true,
          status: true,
          startDate: true,
          expectedEndDate: true,
          services: {
            select: { id: true, totalM2: true, completedM2: true },
          },
          _count: {
            select: { dayLogEntries: true, photos: true, budgets: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    },
    ["obras", status ?? "all"],
    [TAGS.obras]
  )();

export const getActiveObrasCached = () =>
  cached(
    async () =>
      prisma.obra.findMany({
        where: { status: "EM_ANDAMENTO" },
        select: {
          id: true,
          clientName: true,
          address: true,
          expectedEndDate: true,
          services: { select: { totalM2: true, completedM2: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ["obras", "active"],
    [TAGS.obras]
  )();

export const getNextEndingObraCached = () =>
  cached(
    async () =>
      prisma.obra.findFirst({
        where: { status: "EM_ANDAMENTO", expectedEndDate: { not: null } },
        select: { clientName: true, expectedEndDate: true },
        orderBy: { expectedEndDate: "asc" },
      }),
    ["obras", "next-ending"],
    [TAGS.obras]
  )();

/**
 * Obras lancaveis no "Adicionar Dia" - exclui apenas concluidas.
 * Inclui o tipo dos servicos (necessario na UI do stepper).
 */
export const getObrasForDayLogCached = () =>
  cached(
    async () =>
      prisma.obra.findMany({
        where: { status: { in: ["EM_ANDAMENTO", "ORCAMENTO", "PAUSADA"] } },
        select: {
          id: true,
          clientName: true,
          services: {
            select: { id: true, type: true, totalM2: true, completedM2: true },
          },
        },
        orderBy: { clientName: "asc" },
      }),
    ["obras", "selectable"],
    [TAGS.obras]
  )();

export const getObraByIdCached = (id: string) =>
  cached(
    async () =>
      prisma.obra.findUnique({
        where: { id },
        include: {
          services: { orderBy: { createdAt: "asc" } },
          budgets: { orderBy: { createdAt: "desc" } },
        },
      }),
    ["obra", id],
    [TAGS.obra(id)]
  )();
