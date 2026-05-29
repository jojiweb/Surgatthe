"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ObraStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { TAGS } from "@/lib/data/cache";

const ObraServiceSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.string().min(1, "Tipo obrigatorio"),
  totalM2: z.coerce.number().positive("m2 deve ser positivo"),
  pricePerM2: z.coerce.number().min(0),
});

const ObraSchema = z.object({
  clientName: z.string().min(1, "Cliente obrigatorio"),
  address: z.string().min(1, "Endereco obrigatorio"),
  startDate: z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  status: z.nativeEnum(ObraStatus),
  companyName: z.string().min(1).default("FG Construcoes & Reformas"),
  services: z.array(ObraServiceSchema).default([]),
});

export type ObraInput = z.infer<typeof ObraSchema>;

function parseDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createObra(input: ObraInput) {
  await requireUser();
  const data = ObraSchema.parse(input);
  const obra = await prisma.obra.create({
    data: {
      clientName: data.clientName,
      address: data.address,
      startDate: parseDate(data.startDate),
      expectedEndDate: parseDate(data.expectedEndDate),
      status: data.status,
      companyName: data.companyName,
      services: {
        create: data.services.map((s) => ({
          type: s.type,
          totalM2: s.totalM2,
          pricePerM2: s.pricePerM2,
        })),
      },
    },
  });
  revalidateTag(TAGS.obras);
  redirect(`/obras/${obra.id}`);
}

export async function updateObra(id: string, input: ObraInput) {
  await requireUser();
  const data = ObraSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    await tx.obra.update({
      where: { id },
      data: {
        clientName: data.clientName,
        address: data.address,
        startDate: parseDate(data.startDate),
        expectedEndDate: parseDate(data.expectedEndDate),
        status: data.status,
        companyName: data.companyName,
      },
    });

    // Reconcilia ObraService: atualiza existentes, cria novos, deleta ausentes.
    const existing = await tx.obraService.findMany({ where: { obraId: id } });
    const incomingIds = data.services
      .map((s) => s.id)
      .filter((x): x is string => !!x);
    const toDelete = existing.filter((e) => !incomingIds.includes(e.id));

    for (const del of toDelete) {
      await tx.obraService.delete({ where: { id: del.id } });
    }
    for (const s of data.services) {
      if (s.id) {
        await tx.obraService.update({
          where: { id: s.id },
          data: { type: s.type, totalM2: s.totalM2, pricePerM2: s.pricePerM2 },
        });
      } else {
        await tx.obraService.create({
          data: {
            obraId: id,
            type: s.type,
            totalM2: s.totalM2,
            pricePerM2: s.pricePerM2,
          },
        });
      }
    }
  });

  revalidateTag(TAGS.obras);
  revalidateTag(TAGS.obra(id));
  redirect(`/obras/${id}`);
}

export async function deleteObra(id: string) {
  await requireUser();
  await prisma.obra.delete({ where: { id } });
  revalidateTag(TAGS.obras);
  revalidateTag(TAGS.obra(id));
  redirect("/obras");
}
