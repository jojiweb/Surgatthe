import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ObraForm } from "@/components/obras/obra-form";
import { Button } from "@/components/ui/button";
import { getObraById } from "@/lib/actions/obras";

export default async function EditarObraPage({
  params,
}: {
  params: { id: string };
}) {
  const obra = await getObraById(params.id);
  if (!obra) notFound();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/obras/${params.id}`}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Editar Obra</h1>
      <ObraForm
        mode="edit"
        obraId={obra.id}
        initial={{
          clientName: obra.clientName,
          address: obra.address,
          startDate: obra.startDate ? obra.startDate.toISOString() : null,
          expectedEndDate: obra.expectedEndDate
            ? obra.expectedEndDate.toISOString()
            : null,
          status: obra.status,
          companyName: obra.companyName,
          services: obra.services.map((s) => ({
            id: s.id,
            type: s.type,
            totalM2: s.totalM2,
            pricePerM2: s.pricePerM2,
          })),
        }}
      />
    </div>
  );
}
