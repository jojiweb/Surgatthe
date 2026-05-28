"use server";

import { Member } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Calculo de salario - implementacao COMPLETA ja na Etapa 1.
 *
 *   bruto         = SUM(entries.dailyRateSnapshot * entries.fraction)
 *                   onde existe DayLogWorker.memberId = memberId
 *   descontos     = SUM(absences.discountValue) where memberId
 *   pago          = SUM(payments.amount) where memberId
 *   liquido       = bruto - descontos
 *   saldoDevedor  = liquido - pago
 *
 * Absence e Payment nao tem UI na Etapa 1, suas somas serao 0.
 * A Etapa 2 so adiciona a UI - esta funcao nao muda.
 *
 * Tambem retorna breakdown por obra e historico de dias trabalhados.
 */

export type SalaryResult = {
  memberId: string;
  memberName: string;
  bruto: number;
  descontos: number;
  pago: number;
  liquido: number;
  saldoDevedor: number;
  diasTrabalhados: number;
  porObra: Array<{ obraId: string; obraName: string; valor: number; dias: number }>;
  historico: Array<{
    date: Date;
    obraId: string;
    obraName: string;
    fraction: number;
    dailyRateSnapshot: number;
    valor: number;
  }>;
};

export async function calculateSalary(
  memberId: string,
  range?: { from?: Date; to?: Date }
): Promise<SalaryResult> {
  await requireUser();
  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  return computeSalary(member, range);
}

/**
 * Nucleo do calculo. Recebe o Member ja carregado (evita uma query extra)
 * e NAO revalida auth - quem chama (entry point) ja fez requireUser().
 * Permite que getAllMembersSalaries calcule todos em paralelo.
 */
async function computeSalary(
  member: Member,
  range?: { from?: Date; to?: Date }
): Promise<SalaryResult> {
  const memberId = member.id;

  const dateFilter =
    range?.from || range?.to
      ? {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        }
      : undefined;

  // Busca todas as entries em que este member trabalhou
  const workerEntries = await prisma.dayLogWorker.findMany({
    where: {
      memberId,
      ...(dateFilter
        ? { dayLogEntry: { dayLog: { date: dateFilter } } }
        : {}),
    },
    include: {
      dayLogEntry: {
        include: {
          dayLog: true,
          obra: { select: { id: true, clientName: true } },
        },
      },
    },
  });

  let bruto = 0;
  const porObraMap = new Map<
    string,
    { obraName: string; valor: number; dias: number }
  >();
  const historico: SalaryResult["historico"] = [];
  const diasSet = new Set<string>();

  for (const w of workerEntries) {
    const entry = w.dayLogEntry;
    const valor = entry.dailyRateSnapshot * entry.fraction;
    bruto += valor;
    diasSet.add(entry.dayLog.id);

    const obraKey = entry.obra.id;
    const prev = porObraMap.get(obraKey) ?? {
      obraName: entry.obra.clientName,
      valor: 0,
      dias: 0,
    };
    prev.valor += valor;
    prev.dias += 1;
    porObraMap.set(obraKey, prev);

    historico.push({
      date: entry.dayLog.date,
      obraId: entry.obra.id,
      obraName: entry.obra.clientName,
      fraction: entry.fraction,
      dailyRateSnapshot: entry.dailyRateSnapshot,
      valor,
    });
  }

  historico.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Absences e Payments (UI na Etapa 2) - somas serao 0 enquanto isso.
  const [absencesAgg, paymentsAgg] = await Promise.all([
    prisma.absence.aggregate({
      where: {
        memberId,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      _sum: { discountValue: true },
    }),
    prisma.payment.aggregate({
      where: {
        memberId,
        ...(dateFilter ? { paymentDate: dateFilter } : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const descontos = absencesAgg._sum.discountValue ?? 0;
  const pago = paymentsAgg._sum.amount ?? 0;
  const liquido = bruto - descontos;
  const saldoDevedor = liquido - pago;

  return {
    memberId,
    memberName: member.name,
    bruto,
    descontos,
    pago,
    liquido,
    saldoDevedor,
    diasTrabalhados: diasSet.size,
    porObra: Array.from(porObraMap.entries()).map(([obraId, v]) => ({
      obraId,
      obraName: v.obraName,
      valor: v.valor,
      dias: v.dias,
    })),
    historico,
  };
}

export async function getAllMembersSalaries(range?: { from?: Date; to?: Date }) {
  await requireUser();
  const members = await prisma.member.findMany({ orderBy: { name: "asc" } });
  // Calcula todos os membros em PARALELO (antes era serial com await em loop).
  return Promise.all(members.map((m) => computeSalary(m, range)));
}
