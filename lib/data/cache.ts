/**
 * Convencao central de cache do app.
 *
 * Toda leitura de dados deve ir por aqui (ou por modulos lib/data/*
 * que reusam `cached(...)`), nunca como query Prisma solta dentro de
 * page.tsx. Mutacao chama `revalidateTag(...)` com as tags afetadas.
 *
 * Tags em uso:
 *   - "obras"               lista geral de obras
 *   - "obra:{id}"           detalhe de uma obra (services, budgets, etc.)
 *   - "salaries"            calculos de salario de todos os membros
 *   - "fotos:{obraId}"      lista de fotos + signed URLs de uma obra
 *   - "dias:{obraId}"       dias trabalhados de uma obra
 *   - "members"             lista de Members (raro mudar)
 *
 * Revalidate padrao de 5min eh um teto: se nada mudar, refresca sozinho.
 */
import { unstable_cache } from "next/cache";

export const TAGS = {
  obras: "obras",
  obra: (id: string) => `obra:${id}`,
  salaries: "salaries",
  fotos: (obraId: string) => `fotos:${obraId}`,
  dias: (obraId: string) => `dias:${obraId}`,
  members: "members",
} as const;

export function cached<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  tags: string[],
  revalidateSeconds = 300
) {
  return unstable_cache(fn, keyParts, { tags, revalidate: revalidateSeconds });
}
