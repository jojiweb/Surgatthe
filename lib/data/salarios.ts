import { Member } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached, TAGS } from "./cache";

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

/**
 * Calculo do salario de UM membro. Recebe Member ja carregado e nao
 * revalida auth - quem chama (entry point) eh responsavel.
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

  const workerEntries = await prisma.dayLogWorker.findMany({
    where: {
      memberId,
      ...(dateFilter ? { dayLogEntry: { dayLog: { date: dateFilter } } } : {}),
    },
    select: {
      dayLogEntry: {
        select: {
          fraction: true,
          dailyRateSnapshot: true,
          dayLog: { select: { id: true, date: true } },
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

    const prev = porObraMap.get(entry.obra.id) ?? {
      obraName: entry.obra.clientName,
      valor: 0,
      dias: 0,
    };
    prev.valor += valor;
    prev.dias += 1;
    porObraMap.set(entry.obra.id, prev);

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

  const [absencesAgg, paymentsAgg] = await Promise.all([
    prisma.absence.aggregate({
      where: { memberId, ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { discountValue: true },
    }),
    prisma.payment.aggregate({
      where: { memberId, ...(dateFilter ? { paymentDate: dateFilter } : {}) },
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

function rangeKey(range?: { from?: Date; to?: Date }): string {
  if (!range) return "all";
  return `${range.from?.toISOString() ?? "-"}_${range.to?.toISOString() ?? "-"}`;
}

/**
 * Salario de todos os membros. Cacheado por range.
 * Invalidado por createDayLog -> revalidateTag("salaries").
 */
export const getAllMembersSalariesCached = (range?: { from?: Date; to?: Date }) =>
  cached(
    async () => {
      const members = await prisma.member.findMany({ orderBy: { name: "asc" } });
      return Promise.all(members.map((m) => computeSalary(m, range)));
    },
    ["salaries", rangeKey(range)],
    [TAGS.salaries, TAGS.members]
  )();
