"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ObraStatus } from "@prisma/client";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/lib/hooks/use-toast";
import { createObra, updateObra } from "@/lib/actions/obras";

type ServiceRow = {
  id?: string;
  type: string;
  totalM2: string;
  pricePerM2: string;
};

type Props = {
  mode: "create" | "edit";
  obraId?: string;
  initial?: {
    clientName: string;
    address: string;
    startDate: string | null;
    expectedEndDate: string | null;
    status: ObraStatus;
    companyName: string;
    services: Array<{ id: string; type: string; totalM2: number; pricePerM2: number }>;
  };
};

function dateInput(d?: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function ObraForm({ mode, obraId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [startDate, setStartDate] = useState(dateInput(initial?.startDate));
  const [expectedEndDate, setExpectedEndDate] = useState(
    dateInput(initial?.expectedEndDate)
  );
  const [status, setStatus] = useState<ObraStatus>(
    initial?.status ?? ObraStatus.ORCAMENTO
  );
  const [companyName, setCompanyName] = useState(
    initial?.companyName ?? "FG Construcoes & Reformas"
  );
  const [services, setServices] = useState<ServiceRow[]>(
    initial?.services.map((s) => ({
      id: s.id,
      type: s.type,
      totalM2: String(s.totalM2),
      pricePerM2: String(s.pricePerM2),
    })) ?? []
  );

  function addService() {
    setServices((s) => [...s, { type: "", totalM2: "", pricePerM2: "" }]);
  }
  function removeService(i: number) {
    setServices((s) => s.filter((_, idx) => idx !== i));
  }
  function updateService(i: number, patch: Partial<ServiceRow>) {
    setServices((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      clientName,
      address,
      startDate: startDate || null,
      expectedEndDate: expectedEndDate || null,
      status,
      companyName,
      services: services
        .filter((s) => s.type.trim())
        .map((s) => ({
          id: s.id,
          type: s.type,
          totalM2: Number(s.totalM2) || 0,
          pricePerM2: Number(s.pricePerM2) || 0,
        })),
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await createObra(payload);
        } else if (obraId) {
          await updateObra(obraId, payload);
        }
        toast({ title: "Obra salva" });
      } catch (err: any) {
        if (err?.digest?.startsWith("NEXT_REDIRECT")) return; // redirect normal
        setError(err?.message ?? "Erro ao salvar");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Cliente</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ObraStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORCAMENTO">Orcamento</SelectItem>
                  <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
                  <SelectItem value="PAUSADA">Pausada</SelectItem>
                  <SelectItem value="CONCLUIDA">Concluida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereco</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              rows={2}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data de inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Previsao de fim</Label>
              <Input
                id="endDate"
                type="date"
                value={expectedEndDate}
                onChange={(e) => setExpectedEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Empresa</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Servicos</h3>
            <Button type="button" size="sm" variant="outline" onClick={addService}>
              <Plus className="h-4 w-4" /> Servico
            </Button>
          </div>
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Adicione os servicos com tipo, m2 total e preco por m2.
            </p>
          )}
          {services.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 items-end border rounded-md p-3"
            >
              <div className="col-span-12 sm:col-span-5 space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Input
                  value={s.type}
                  onChange={(e) => updateService(i, { type: e.target.value })}
                  placeholder="Ex: Piso, Pedra parede"
                />
              </div>
              <div className="col-span-5 sm:col-span-3 space-y-1">
                <Label className="text-xs">m2 total</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={s.totalM2}
                  onChange={(e) => updateService(i, { totalM2: e.target.value })}
                />
              </div>
              <div className="col-span-5 sm:col-span-3 space-y-1">
                <Label className="text-xs">R$/m2</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={s.pricePerM2}
                  onChange={(e) =>
                    updateService(i, { pricePerM2: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeService(i)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  );
}
