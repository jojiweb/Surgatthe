"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { TAGS } from "@/lib/data/cache";

const BudgetSchema = z.object({
  obraId: z.string().uuid(),
  title: z.string().min(1, "Titulo obrigatorio"),
  description: z.string().optional().nullable(),
  laborTotal: z.coerce.number().min(0).nullable().optional(),
  materialTotal: z.coerce.number().min(0).nullable().optional(),
  totalValue: z.coerce.number().min(0, "Valor total obrigatorio"),
});

export type BudgetInput = z.infer<typeof BudgetSchema>;

export async function createBudget(input: BudgetInput) {
  await requireUser();
  const data = BudgetSchema.parse(input);
  await prisma.budget.create({
    data: {
      obraId: data.obraId,
      title: data.title,
      description: data.description ?? null,
      laborTotal: data.laborTotal ?? null,
      materialTotal: data.materialTotal ?? null,
      totalValue: data.totalValue,
    },
  });
  revalidateTag(TAGS.obra(data.obraId));
}

export async function updateBudget(id: string, input: BudgetInput) {
  await requireUser();
  const data = BudgetSchema.parse(input);
  await prisma.budget.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description ?? null,
      laborTotal: data.laborTotal ?? null,
      materialTotal: data.materialTotal ?? null,
      totalValue: data.totalValue,
    },
  });
  revalidateTag(TAGS.obra(data.obraId));
}

export async function deleteBudget(id: string) {
  await requireUser();
  const b = await prisma.budget.delete({ where: { id } });
  revalidateTag(TAGS.obra(b.obraId));
}
