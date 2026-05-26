"use client";

import Link from "next/link";
import { ObraStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value?: ObraStatus; label: string }> = [
  { label: "Todas" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "ORCAMENTO", label: "Orcamento" },
  { value: "PAUSADA", label: "Pausada" },
  { value: "CONCLUIDA", label: "Concluida" },
];

export function ObrasFilter({ current }: { current?: ObraStatus }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {OPTIONS.map((o) => {
        const href = o.value ? `/obras?status=${o.value}` : "/obras";
        const active = (current ?? undefined) === o.value;
        return (
          <Link
            key={o.label}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1 text-xs border transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-accent"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
