import Link from "next/link";
import { Plus, HardHat } from "lucide-react";
import { ObraStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RealtimeWrapper } from "@/components/realtime-wrapper";
import { StatusBadge } from "@/components/obras/status-badge";
import { ObrasFilter } from "./obras-filter";
import { requireUser } from "@/lib/auth";
import { getObrasCached } from "@/lib/data/obras";
import { pct } from "@/lib/utils";

type Search = { status?: string };

export default async function ObrasPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  await requireUser();
  const statusFilter =
    searchParams.status && searchParams.status in ObraStatus
      ? (searchParams.status as ObraStatus)
      : undefined;
  const obras = await getObrasCached(statusFilter);

  return (
    <div className="space-y-4">
      <RealtimeWrapper tables={["Obra", "ObraService"]} />

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Obras</h1>
        <Button asChild>
          <Link href="/obras/nova">
            <Plus className="h-4 w-4" />
            Nova Obra
          </Link>
        </Button>
      </div>

      <ObrasFilter current={statusFilter} />

      {obras.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <HardHat className="h-10 w-10 mx-auto mb-2 opacity-40" />
            Nenhuma obra encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {obras.map((o) => {
            const total = o.services.reduce((a, s) => a + s.totalM2, 0);
            const done = o.services.reduce((a, s) => a + s.completedM2, 0);
            const progress = pct(done, total);
            return (
              <Link key={o.id} href={`/obras/${o.id}`}>
                <Card className="hover:bg-accent/30 transition-colors h-full">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{o.clientName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {o.address}
                        </div>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                    {total > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>
                            {done.toFixed(0)} / {total.toFixed(0)} m2
                          </span>
                          <span>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                    )}
                    <div className="flex gap-3 text-xs text-muted-foreground pt-1">
                      <span>{o._count.dayLogEntries} dias</span>
                      <span>{o._count.budgets} orcamentos</span>
                      <span>{o._count.photos} fotos</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
