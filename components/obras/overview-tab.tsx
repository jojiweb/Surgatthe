import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/obras/status-badge";
import { formatDate } from "@/lib/utils";

type Obra = {
  id: string;
  clientName: string;
  address: string;
  startDate: Date | null;
  expectedEndDate: Date | null;
  status: any;
  companyName: string;
};

export function OverviewTab({ obra }: { obra: Obra }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link href={`/obras/${obra.id}/editar`}>
              <Pencil className="h-4 w-4" /> Editar
            </Link>
          </Button>
        </div>

        <Row label="Cliente" value={obra.clientName} />
        <Row label="Endereco" value={obra.address} />
        <Row
          label="Status"
          value={<StatusBadge status={obra.status} />}
        />
        <Row label="Inicio" value={formatDate(obra.startDate)} />
        <Row label="Previsao de fim" value={formatDate(obra.expectedEndDate)} />
        <Row label="Empresa" value={obra.companyName} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b pb-2 last:border-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">{value}</div>
    </div>
  );
}
