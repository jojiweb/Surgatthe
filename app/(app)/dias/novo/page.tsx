import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiaStepper } from "@/components/dias/dia-stepper";
import { requireUser } from "@/lib/auth";
import { getObrasForDayLogCached } from "@/lib/data/obras";
import { getMembersCached } from "@/lib/data/dias";

export default async function NovoDiaPage() {
  await requireUser();

  const [obras, members] = await Promise.all([
    getObrasForDayLogCached(),
    getMembersCached(),
  ]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Adicionar Dia</h1>

      <DiaStepper obras={obras} members={members} />
    </div>
  );
}
