import { ObraStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<
  ObraStatus,
  { label: string; variant: "info" | "success" | "warning" | "outline" | "secondary" }
> = {
  ORCAMENTO: { label: "Orcamento", variant: "outline" },
  EM_ANDAMENTO: { label: "Em andamento", variant: "info" },
  PAUSADA: { label: "Pausada", variant: "warning" },
  CONCLUIDA: { label: "Concluida", variant: "success" },
};

export function StatusBadge({ status }: { status: ObraStatus }) {
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
