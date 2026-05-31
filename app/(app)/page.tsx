import Link from "next/link";
import { Plus, HardHat, Calendar, DollarSign } from "lucide-react";
import { startOfWeek, endOfWeek } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RealtimeWrapper } from "@/components/realtime-wrapper";
import { requireUser } from "@/lib/auth";
import {
  getActiveObrasCached,
  getNextEndingObraCached,
} from "@/lib/data/obras";
import { getAllMembersSalariesCached } from "@/lib/data/salarios";
import { formatBRL, formatDateLong, pct } from "@/lib/utils";

export default async function DashboardPage() {
  await requireUser();

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [obrasAtivas, salariosSemana, proximaObra] = await Promise.all([
    getActiveObrasCached(),
    getAllMembersSalariesCached({ from: weekStart, to: weekEnd }),
    getNextEndingObraCached(),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeWrapper tables={["Obra", "DayLog", "DayLogEntry", "ObraService"]} />

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{formatDateLong(now)}</p>
        </div>
        <Button asChild size="lg" className="hidden md:flex">
          <Link href="/dias/novo">
            <Plus className="h-5 w-5" />
            Adicionar Dia
          </Link>
        </Button>
      </header>

      {/* Botao destaque mobile */}
      <Button asChild size="lg" className="md:hidden w-full h-14 text-base">
        <Link href="/dias/novo">
          <Plus className="h-5 w-5" />
          Adicionar Dia
        </Link>
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <HardHat className="h-4 w-4" /> Obras em andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{obrasAtivas.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" /> A receber esta semana
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {salariosSemana.map((s) => (
              <div key={s.memberId} className="flex justify-between text-sm">
                <span>{s.memberName}</span>
                <span className="font-semibold">{formatBRL(s.bruto)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" /> Proximo fim previsto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximaObra ? (
              <>
                <div className="text-base font-semibold">
                  {formatDateLong(proximaObra.expectedEndDate)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {proximaObra.clientName}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhuma definida</div>
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Obras em andamento</h2>
        {obrasAtivas.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma obra em andamento.{" "}
              <Link href="/obras/nova" className="text-primary underline">
                Criar uma
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {obrasAtivas.map((o) => {
              const total = o.services.reduce((a, s) => a + s.totalM2, 0);
              const done = o.services.reduce((a, s) => a + s.completedM2, 0);
              const progress = pct(done, total);
              return (
                <Link key={o.id} href={`/obras/${o.id}`} className="block">
                  <Card className="hover:bg-accent/30 transition-colors">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <div className="font-semibold">{o.clientName}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.address}
                          </div>
                        </div>
                        <Badge variant="info">Em andamento</Badge>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>
                            {done.toFixed(0)} / {total.toFixed(0)} m2
                          </span>
                          <span>{progress.toFixed(0)}%</span>
                        </div>
                        <Progress value={progress} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
