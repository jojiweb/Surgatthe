import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBRL, pct } from "@/lib/utils";

type Service = {
  id: string;
  type: string;
  totalM2: number;
  completedM2: number;
  pricePerM2: number;
};

export function ServicesTab({ services }: { services: Service[] }) {
  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Nenhum servico cadastrado. Edite a obra para adicionar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {services.map((s) => {
        const p = pct(s.completedM2, s.totalM2);
        const total = s.totalM2 * s.pricePerM2;
        return (
          <Card key={s.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.type}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBRL(s.pricePerM2)}/m2 - total {formatBRL(total)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{p.toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">
                    {s.completedM2.toFixed(1)} / {s.totalM2.toFixed(1)} m2
                  </div>
                </div>
              </div>
              <Progress value={p} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
