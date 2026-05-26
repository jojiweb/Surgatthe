import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/utils";

type Entry = {
  id: string;
  fraction: number;
  dailyRateSnapshot: number;
  dayLog: { id: string; date: Date; notes: string | null };
  workers: { member: { id: string; name: string } }[];
  serviceProgress: {
    metersCompleted: number;
    obraService: { type: string };
  }[];
};

export function DaysTab({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Ainda nao foi registrado nenhum dia para esta obra.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const valor = e.fraction * e.dailyRateSnapshot;
        return (
          <Card key={e.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div>
                  <div className="font-semibold">{formatDate(e.dayLog.date)}</div>
                  <div className="text-xs text-muted-foreground">
                    Diaria base: {formatBRL(e.dailyRateSnapshot)}
                    {e.fraction < 1 && ` - fracao ${(e.fraction * 100).toFixed(0)}%`}
                  </div>
                </div>
                <Badge variant="secondary">
                  {formatBRL(valor)} (x {e.workers.length})
                </Badge>
              </div>

              <div className="flex flex-wrap gap-1">
                {e.workers.map((w) => (
                  <Badge key={w.member.id} variant="outline">
                    {w.member.name}
                  </Badge>
                ))}
              </div>

              {e.serviceProgress.length > 0 && (
                <ul className="text-sm text-muted-foreground">
                  {e.serviceProgress.map((sp, i) => (
                    <li key={i}>
                      {sp.obraService.type}: {sp.metersCompleted.toFixed(1)} m2
                    </li>
                  ))}
                </ul>
              )}

              {e.dayLog.notes && (
                <p className="text-sm bg-muted/50 rounded p-2">{e.dayLog.notes}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
