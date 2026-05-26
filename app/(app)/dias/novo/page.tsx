import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiaStepper } from "@/components/dias/dia-stepper";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NovoDiaPage() {
  await requireUser();

  const [obras, members] = await Promise.all([
    prisma.obra.findMany({
      where: { status: { in: ["EM_ANDAMENTO", "ORCAMENTO", "PAUSADA"] } },
      include: { services: true },
      orderBy: { clientName: "asc" },
    }),
    prisma.member.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Adicionar Dia</h1>

      <DiaStepper
        obras={obras.map((o) => ({
          id: o.id,
          clientName: o.clientName,
          services: o.services.map((s) => ({
            id: s.id,
            type: s.type,
            totalM2: s.totalM2,
            completedM2: s.completedM2,
          })),
        }))}
        members={members.map((m) => ({
          id: m.id,
          name: m.name,
          dailyRate: m.dailyRate,
        }))}
      />
    </div>
  );
}
