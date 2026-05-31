"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhotoAlbum } from "@prisma/client";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/browser";
import { uploadPhotos } from "@/lib/upload-photos";
import { createDayLog } from "@/lib/actions/dias";
import { toast } from "@/lib/hooks/use-toast";
import { formatBRL, cn } from "@/lib/utils";

type Obra = {
  id: string;
  clientName: string;
  services: { id: string; type: string; totalM2: number; completedM2: number }[];
};
type Member = { id: string; name: string; dailyRate: number };

type EntryState = {
  obraId: string;
  fraction: number;
  dailyRateSnapshot: number;
  workerIds: string[];
  serviceProgress: Record<string, string>; // obraServiceId -> meters as string
};

type ExpenseState = {
  obraId: string | null;
  description: string;
  value: string;
};

type PhotoState = {
  file: File;
  obraId: string;
  album: PhotoAlbum;
  caption: string;
};

const STEPS = [
  "Data e obras",
  "Membros e diaria",
  "Fracao do dia",
  "Servicos feitos",
  "Gastos",
  "Observacoes e fotos",
  "Resumo",
];

export function DiaStepper({
  obras,
  members,
}: {
  obras: Obra[];
  members: Member[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState(0);
  const [date, setDate] = useState(today);
  const [selectedObras, setSelectedObras] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [expenses, setExpenses] = useState<ExpenseState[]>([]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleObra(id: string) {
    setSelectedObras((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];

      setEntries((cur) => {
        const out: Record<string, EntryState> = {};
        const evenFraction = next.length > 0 ? 1 / next.length : 1;
        const defaultRate = members[0]?.dailyRate ?? 130;
        next.forEach((oid) => {
          out[oid] = cur[oid] ?? {
            obraId: oid,
            fraction: evenFraction,
            dailyRateSnapshot: defaultRate,
            workerIds: [],
            serviceProgress: {},
          };
          out[oid].fraction = evenFraction;
        });
        return out;
      });
      return next;
    });
  }

  function updateEntry(id: string, patch: Partial<EntryState>) {
    setEntries((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  }

  function toggleWorker(entryId: string, memberId: string) {
    setEntries((cur) => {
      const e = cur[entryId];
      const has = e.workerIds.includes(memberId);
      return {
        ...cur,
        [entryId]: {
          ...e,
          workerIds: has
            ? e.workerIds.filter((x) => x !== memberId)
            : [...e.workerIds, memberId],
        },
      };
    });
  }

  function addExpense() {
    setExpenses((x) => [...x, { obraId: null, description: "", value: "" }]);
  }
  function updateExpense(i: number, patch: Partial<ExpenseState>) {
    setExpenses((x) => x.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeExpense(i: number) {
    setExpenses((x) => x.filter((_, idx) => idx !== i));
  }

  function addPhotos(files: FileList | null, obraId: string) {
    if (!files) return;
    const arr = Array.from(files).map<PhotoState>((f) => ({
      file: f,
      obraId,
      album: "DURANTE",
      caption: "",
    }));
    setPhotos((p) => [...p, ...arr]);
  }

  function updatePhoto(i: number, patch: Partial<PhotoState>) {
    setPhotos((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  const fractionSum = useMemo(
    () =>
      Object.values(entries).reduce((a, e) => a + (Number(e.fraction) || 0), 0),
    [entries]
  );

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return !!date && selectedObras.length > 0;
      case 1:
        return selectedObras.every(
          (oid) =>
            entries[oid] &&
            entries[oid].workerIds.length > 0 &&
            entries[oid].dailyRateSnapshot >= 0
        );
      case 2:
        if (selectedObras.length === 1) return true;
        return Math.abs(fractionSum - 1) < 0.01;
      default:
        return true;
    }
  }, [step, date, selectedObras, entries, fractionSum]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();

    try {
      // Upload das fotos antes do create. Agrupa por obra para que cada
      // grupo possa rodar em paralelo via uploadPhotos (pool interno).
      const uploadedPhotos: {
        obraId: string;
        storagePath: string;
        album: PhotoAlbum;
        caption: string | null;
      }[] = [];
      if (photos.length > 0) {
        setProgress({ done: 0, total: photos.length });
        const byObra = new Map<string, typeof photos>();
        for (const p of photos) {
          const arr = byObra.get(p.obraId) ?? [];
          arr.push(p);
          byObra.set(p.obraId, arr);
        }
        let globalDone = 0;
        for (const [oid, group] of Array.from(byObra.entries())) {
          const files = group.map((g) => g.file);
          const uploaded = await uploadPhotos(supabase, oid, files, {
            concurrency: 3,
            onProgress: (d) =>
              setProgress({ done: globalDone + d, total: photos.length }),
          });
          uploaded.forEach((u, i) => {
            uploadedPhotos.push({
              obraId: oid,
              storagePath: u.storagePath,
              album: group[i].album,
              caption: group[i].caption || null,
            });
          });
          globalDone += group.length;
        }
      }

      const payload = {
        date,
        notes: notes || null,
        entries: selectedObras.map((oid) => {
          const e = entries[oid];
          return {
            obraId: oid,
            fraction: e.fraction,
            dailyRateSnapshot: e.dailyRateSnapshot,
            workerIds: e.workerIds,
            serviceProgress: Object.entries(e.serviceProgress)
              .filter(([, v]) => Number(v) > 0)
              .map(([obraServiceId, v]) => ({
                obraServiceId,
                metersCompleted: Number(v),
              })),
          };
        }),
        expenses: expenses
          .filter((x) => x.description.trim())
          .map((x) => ({
            obraId: x.obraId,
            description: x.description,
            value: Number(x.value) || 0,
          })),
        photos: uploadedPhotos.map((p) => ({
          ...p,
          isPortfolio: false,
        })),
      };

      startTransition(async () => {
        await createDayLog(payload);
        toast({ title: "Dia registrado" });
        router.push("/");
        router.refresh();
      });
    } catch (e: any) {
      setError(e?.message ?? "Erro ao salvar");
      setSubmitting(false);
      setProgress(null);
    }
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
  }
  function prev() {
    if (step > 0) setStep(step - 1);
  }

  // ---- Filtros uteis ----
  const skipFractionStep = selectedObras.length <= 1;

  return (
    <div className="space-y-4">
      {/* Indicador de passos */}
      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "flex-shrink-0 text-xs px-2 py-1 rounded-full border",
              i === step
                ? "bg-primary text-primary-foreground border-primary"
                : i < step
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Selecionar obra(s)</Label>
              <p className="text-xs text-muted-foreground">
                Marque uma ou mais obras trabalhadas no dia.
              </p>
              <div className="grid gap-2">
                {obras.map((o) => {
                  const sel = selectedObras.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex items-center gap-3 border rounded-md p-3 cursor-pointer",
                        sel && "border-primary bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={sel}
                        onCheckedChange={() => toggleObra(o.id)}
                      />
                      <span className="text-sm">{o.clientName}</span>
                    </label>
                  );
                })}
                {obras.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Cadastre uma obra primeiro.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {selectedObras.map((oid) => {
            const obra = obras.find((o) => o.id === oid)!;
            const e = entries[oid];
            return (
              <Card key={oid}>
                <CardContent className="pt-6 space-y-4">
                  <div className="font-semibold">{obra.clientName}</div>
                  <div>
                    <Label className="text-xs">Membros que trabalharam</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {members.map((m) => {
                        const checked = e.workerIds.includes(m.id);
                        return (
                          <label
                            key={m.id}
                            className={cn(
                              "flex items-center gap-2 border rounded-md p-2 cursor-pointer",
                              checked && "border-primary bg-primary/5"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleWorker(oid, m.id)}
                            />
                            <span className="text-sm">{m.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Valor da diaria neste dia (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={e.dailyRateSnapshot}
                      onChange={(ev) =>
                        updateEntry(oid, {
                          dailyRateSnapshot: Number(ev.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Pre-preenchido com a diaria padrao. Edite se o valor foi
                      diferente.
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {skipFractionStep ? (
              <p className="text-sm text-muted-foreground">
                Apenas 1 obra selecionada - dia inteiro nessa obra (100%).
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Defina a fracao do dia por obra. A soma deve ser 100%.
                </p>
                {selectedObras.map((oid) => {
                  const o = obras.find((x) => x.id === oid)!;
                  const e = entries[oid];
                  return (
                    <div key={oid} className="grid grid-cols-3 gap-2 items-center">
                      <div className="text-sm col-span-2">{o.clientName}</div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="1"
                          min={0}
                          max={100}
                          inputMode="numeric"
                          value={Math.round(e.fraction * 100)}
                          onChange={(ev) =>
                            updateEntry(oid, {
                              fraction:
                                Math.max(0, Math.min(100, Number(ev.target.value))) /
                                100,
                            })
                          }
                        />
                        <span className="text-sm">%</span>
                      </div>
                    </div>
                  );
                })}
                <div
                  className={cn(
                    "text-sm font-semibold",
                    Math.abs(fractionSum - 1) < 0.01
                      ? "text-emerald-600"
                      : "text-destructive"
                  )}
                >
                  Soma: {(fractionSum * 100).toFixed(0)}%
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {selectedObras.map((oid) => {
            const obra = obras.find((o) => o.id === oid)!;
            const e = entries[oid];
            return (
              <Card key={oid}>
                <CardContent className="pt-6 space-y-3">
                  <div className="font-semibold">{obra.clientName}</div>
                  {obra.services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Esta obra nao tem servicos cadastrados.
                    </p>
                  ) : (
                    obra.services.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-3 gap-2 items-center"
                      >
                        <div className="col-span-2">
                          <div className="text-sm font-medium">{s.type}</div>
                          <div className="text-xs text-muted-foreground">
                            ja feito: {s.completedM2.toFixed(1)} /{" "}
                            {s.totalM2.toFixed(1)} m2
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            inputMode="decimal"
                            placeholder="0"
                            value={e.serviceProgress[s.id] ?? ""}
                            onChange={(ev) =>
                              updateEntry(oid, {
                                serviceProgress: {
                                  ...e.serviceProgress,
                                  [s.id]: ev.target.value,
                                },
                              })
                            }
                          />
                          <span className="text-sm">m2</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {step === 4 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Opcional. Material, transporte, almoco, etc.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={addExpense}>
                <Plus className="h-4 w-4" /> Gasto
              </Button>
            </div>
            {expenses.map((ex, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded p-2">
                <div className="col-span-12 sm:col-span-5 space-y-1">
                  <Label className="text-xs">Descricao</Label>
                  <Input
                    value={ex.description}
                    onChange={(e) =>
                      updateExpense(i, { description: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-6 sm:col-span-3 space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={ex.value}
                    onChange={(e) => updateExpense(i, { value: e.target.value })}
                  />
                </div>
                <div className="col-span-5 sm:col-span-3 space-y-1">
                  <Label className="text-xs">Obra (opc.)</Label>
                  <Select
                    value={ex.obraId ?? "none"}
                    onValueChange={(v) =>
                      updateExpense(i, { obraId: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {selectedObras.map((oid) => {
                        const o = obras.find((x) => x.id === oid)!;
                        return (
                          <SelectItem key={oid} value={oid}>
                            {o.clientName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExpense(i)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-6 space-y-2">
              <Label>Observacoes do dia</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Como foi o dia, intercorrencias, etc."
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <Label>Fotos do dia (opcional)</Label>
              {selectedObras.map((oid) => {
                const obra = obras.find((o) => o.id === oid)!;
                return (
                  <div key={oid} className="space-y-1">
                    <Label className="text-xs">
                      Adicionar fotos para {obra.clientName}
                    </Label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        addPhotos(e.target.files, oid);
                        e.target.value = "";
                      }}
                    />
                  </div>
                );
              })}
              {photos.length > 0 && (
                <div className="space-y-2 pt-2">
                  {photos.map((p, i) => {
                    const obra = obras.find((o) => o.id === p.obraId)!;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 items-center border rounded p-2"
                      >
                        <div className="col-span-12 sm:col-span-4 text-xs truncate">
                          {p.file.name} -{" "}
                          <span className="text-muted-foreground">
                            {obra.clientName}
                          </span>
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <Select
                            value={p.album}
                            onValueChange={(v) =>
                              updatePhoto(i, { album: v as PhotoAlbum })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ANTES">Antes</SelectItem>
                              <SelectItem value="DURANTE">Durante</SelectItem>
                              <SelectItem value="DEPOIS">Depois</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Input
                          className="col-span-5 sm:col-span-4"
                          placeholder="Legenda"
                          value={p.caption}
                          onChange={(e) =>
                            updatePhoto(i, { caption: e.target.value })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePhoto(i)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {step === 6 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold">Resumo</h3>
            <div className="text-sm">
              <strong>Data:</strong> {date}
            </div>
            <div className="space-y-2">
              {selectedObras.map((oid) => {
                const obra = obras.find((o) => o.id === oid)!;
                const e = entries[oid];
                const valor = e.fraction * e.dailyRateSnapshot;
                return (
                  <div key={oid} className="border rounded p-2 text-sm space-y-1">
                    <div className="font-semibold">{obra.clientName}</div>
                    <div className="text-xs text-muted-foreground">
                      {(e.fraction * 100).toFixed(0)}% do dia, diaria{" "}
                      {formatBRL(e.dailyRateSnapshot)} -{" "}
                      <strong>{formatBRL(valor)} por membro</strong>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {e.workerIds.map((wid) => {
                        const m = members.find((x) => x.id === wid)!;
                        return (
                          <Badge key={wid} variant="secondary">
                            {m?.name}
                          </Badge>
                        );
                      })}
                    </div>
                    {Object.entries(e.serviceProgress)
                      .filter(([, v]) => Number(v) > 0)
                      .map(([sid, v]) => {
                        const s = obra.services.find((x) => x.id === sid);
                        return (
                          <div key={sid} className="text-xs">
                            {s?.type}: {v} m2
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
            {expenses.length > 0 && (
              <div className="text-sm">
                <strong>Gastos:</strong>{" "}
                {formatBRL(
                  expenses.reduce((a, b) => a + (Number(b.value) || 0), 0)
                )}
              </div>
            )}
            {photos.length > 0 && (
              <div className="text-sm">
                <strong>Fotos a enviar:</strong> {photos.length}
              </div>
            )}
            {notes && (
              <div className="text-sm">
                <strong>Obs:</strong> {notes}
              </div>
            )}
            {progress && (
              <p className="text-sm text-muted-foreground">
                Enviando fotos {progress.done} de {progress.total}...
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded p-2">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={prev}
          disabled={step === 0 || submitting || pending}
        >
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canNext}>
            Proximo <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || pending}
          >
            {(submitting || pending) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <Check className="h-4 w-4" /> Salvar dia
          </Button>
        )}
      </div>
    </div>
  );
}
