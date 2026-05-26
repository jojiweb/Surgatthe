import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RealtimeWrapper } from "@/components/realtime-wrapper";
import { getAllMembersSalaries } from "@/lib/actions/salarios";
import { formatBRL, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SalariosPage() {
  const salaries = await getAllMembersSalaries();

  return (
    <div className="space-y-4">
      <RealtimeWrapper tables={["DayLog", "DayLogEntry", "DayLogWorker"]} />

      <h1 className="text-2xl font-bold">Salarios</h1>
      <p className="text-sm text-muted-foreground">
        Acumulado geral, por obra e historico de dias. Faltas e pagamentos serao
        adicionados na proxima etapa.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {salaries.map((s) => (
          <Card key={s.memberId}>
            <CardHeader>
              <CardTitle>{s.memberName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total a receber" value={formatBRL(s.bruto)} primary />
                <Stat label="Dias trabalhados" value={s.diasTrabalhados.toString()} />
                <Stat label="Descontos" value={formatBRL(s.descontos)} />
                <Stat label="Ja pago" value={formatBRL(s.pago)} />
                <Stat
                  label="Saldo devedor"
                  value={formatBRL(s.saldoDevedor)}
                  className="col-span-2"
                  primary
                />
              </div>

              {s.porObra.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Por obra</h4>
                  <ul className="space-y-1">
                    {s.porObra.map((o) => (
                      <li
                        key={o.obraId}
                        className="flex justify-between text-sm border-b pb-1"
                      >
                        <Link
                          href={`/obras/${o.obraId}`}
                          className="hover:underline truncate"
                        >
                          {o.obraName}
                        </Link>
                        <span className="font-semibold whitespace-nowrap ml-2">
                          {formatBRL(o.valor)}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({o.dias}d)
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.historico.length > 0 && (
                <details>
                  <summary className="text-sm font-semibold cursor-pointer">
                    Historico ({s.historico.length} dias)
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                    {s.historico.map((h, i) => (
                      <li
                        key={i}
                        className="flex justify-between text-sm border-b pb-1"
                      >
                        <div>
                          <div>{formatDate(h.date)}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {h.obraName}
                            {h.fraction < 1 && (
                              <Badge variant="outline" className="ml-1 text-[10px]">
                                {(h.fraction * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="font-semibold">{formatBRL(h.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  primary,
  className,
}: {
  label: string;
  value: string;
  primary?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-md border p-3 ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-bold ${primary ? "text-primary text-xl" : "text-base"}`}>
        {value}
      </div>
    </div>
  );
}
