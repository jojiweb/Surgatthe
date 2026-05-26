"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PhotoAlbum } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Schema do formulario "Adicionar Dia". Suporta dia dividido entre 2
 * obras (fractions somam 1.0). Para cada obra, regista:
 *   - membros que trabalharam (workerIds)
 *   - valor da diaria daquele dia (dailyRateSnapshot - editavel)
 *   - metros completados por servico
 *   - gastos do dia (opcional)
 *   - fotos ja uploadadas no Storage (path + album + caption)
 */

const ServiceProgressSchema = z.object({
  obraServiceId: z.string().uuid(),
  metersCompleted: z.coerce.number().min(0),
});

const EntrySchema = z.object({
  obraId: z.string().uuid(),
  fraction: z.coerce.number().positive().max(1),
  dailyRateSnapshot: z.coerce.number().min(0),
  workerIds: z.array(z.string().uuid()).min(1, "Selecione ao menos 1 membro"),
  serviceProgress: z.array(ServiceProgressSchema).default([]),
});

const ExpenseSchema = z.object({
  obraId: z.string().uuid().nullable().optional(),
  description: z.string().min(1),
  value: z.coerce.number().min(0),
});

const PhotoSchema = z.object({
  obraId: z.string().uuid(),
  storagePath: z.string().min(1),
  album: z.nativeEnum(PhotoAlbum),
  caption: z.string().optional().nullable(),
  isPortfolio: z.boolean().default(false),
});

const DayLogSchema = z
  .object({
    date: z.string().min(1),
    notes: z.string().optional().nullable(),
    entries: z.array(EntrySchema).min(1, "Adicione ao menos 1 obra"),
    expenses: z.array(ExpenseSchema).default([]),
    photos: z.array(PhotoSchema).default([]),
  })
  .refine(
    (d) => {
      const sum = d.entries.reduce((a, b) => a + b.fraction, 0);
      return Math.abs(sum - 1) < 0.01;
    },
    { message: "A soma das fracoes precisa ser 1.0", path: ["entries"] }
  );

export type DayLogInput = z.infer<typeof DayLogSchema>;

export async function createDayLog(input: DayLogInput) {
  await requireUser();
  const data = DayLogSchema.parse(input);

  const affectedServiceIds = new Set<string>();

  const result = await prisma.$transaction(async (tx) => {
    const day = await tx.dayLog.create({
      data: {
        date: new Date(data.date),
        notes: data.notes ?? null,
      },
    });

    for (const e of data.entries) {
      const entry = await tx.dayLogEntry.create({
        data: {
          dayLogId: day.id,
          obraId: e.obraId,
          fraction: e.fraction,
          dailyRateSnapshot: e.dailyRateSnapshot,
        },
      });

      for (const wId of e.workerIds) {
        await tx.dayLogWorker.create({
          data: { dayLogEntryId: entry.id, memberId: wId },
        });
      }

      for (const sp of e.serviceProgress) {
        if (sp.metersCompleted <= 0) continue;
        await tx.dayLogServiceProgress.create({
          data: {
            dayLogEntryId: entry.id,
            obraServiceId: sp.obraServiceId,
            metersCompleted: sp.metersCompleted,
          },
        });
        affectedServiceIds.add(sp.obraServiceId);
      }
    }

    for (const ex of data.expenses) {
      if (!ex.description) continue;
      await tx.dayLogExpense.create({
        data: {
          dayLogId: day.id,
          obraId: ex.obraId ?? null,
          description: ex.description,
          value: ex.value,
        },
      });
    }

    for (const ph of data.photos) {
      await tx.obraPhoto.create({
        data: {
          obraId: ph.obraId,
          storagePath: ph.storagePath,
          album: ph.album,
          caption: ph.caption ?? null,
          isPortfolio: ph.isPortfolio,
          dayLogId: day.id,
        },
      });
    }

    // Recalcula completedM2 de cada ObraService afetado:
    // soma de TODOS os DayLogServiceProgress daquele service.
    for (const svcId of Array.from(affectedServiceIds)) {
      const agg = await tx.dayLogServiceProgress.aggregate({
        where: { obraServiceId: svcId },
        _sum: { metersCompleted: true },
      });
      await tx.obraService.update({
        where: { id: svcId },
        data: { completedM2: agg._sum.metersCompleted ?? 0 },
      });
    }

    return day;
  });

  revalidatePath("/");
  revalidatePath("/obras");
  revalidatePath("/salarios");
  for (const e of data.entries) revalidatePath(`/obras/${e.obraId}`);

  return { id: result.id };
}

export async function getDayLogsByObra(obraId: string) {
  await requireUser();
  return prisma.dayLogEntry.findMany({
    where: { obraId },
    include: {
      dayLog: true,
      workers: { include: { member: true } },
      serviceProgress: { include: { obraService: true } },
    },
    orderBy: { dayLog: { date: "desc" } },
  });
}

export async function getMembers() {
  await requireUser();
  return prisma.member.findMany({ orderBy: { name: "asc" } });
}
