"use client";

import { useState, useTransition } from "react";
import { Plus, Copy, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/hooks/use-toast";
import { createBudget, updateBudget, deleteBudget } from "@/lib/actions/orcamentos";
import { formatBRL } from "@/lib/utils";

type Budget = {
  id: string;
  title: string;
  description: string | null;
  laborTotal: number | null;
  materialTotal: number | null;
  totalValue: number;
};

export function BudgetsTab({
  obraId,
  obraClientName,
  budgets,
}: {
  obraId: string;
  obraClientName: string;
  budgets: Budget[];
}) {
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  function openNew() {
    setEditing(null);
    setOpenForm(true);
  }
  function openEdit(b: Budget) {
    setEditing(b);
    setOpenForm(true);
  }

  function copyToClipboard(b: Budget) {
    const lines: string[] = [];
    lines.push(`*${b.title}* - ${obraClientName}`);
    if (b.description) {
      lines.push("");
      lines.push(b.description);
    }
    lines.push("");
    if (b.laborTotal !== null) lines.push(`Mao de obra: ${formatBRL(b.laborTotal)}`);
    if (b.materialTotal !== null) lines.push(`Material: ${formatBRL(b.materialTotal)}`);
    lines.push(`*Total: ${formatBRL(b.totalValue)}*`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Orcamento copiado", description: "Cole no WhatsApp" });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" /> Novo Orcamento
        </Button>
      </div>

      {budgets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum orcamento ainda. Crie quantos forem necessarios (total, parede,
            piso, revisado, etc.).
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {budgets.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{b.title}</div>
                    <div className="text-2xl font-bold text-primary mt-0.5">
                      {formatBRL(b.totalValue)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(b)}
                      title="Copiar"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(b)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton id={b.id} />
                  </div>
                </div>
                {(b.laborTotal !== null || b.materialTotal !== null) && (
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    {b.laborTotal !== null && (
                      <span>Mao de obra: {formatBRL(b.laborTotal)}</span>
                    )}
                    {b.materialTotal !== null && (
                      <span>Material: {formatBRL(b.materialTotal)}</span>
                    )}
                  </div>
                )}
                {b.description && (
                  <p className="text-sm whitespace-pre-wrap text-foreground/80">
                    {b.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BudgetFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        obraId={obraId}
        editing={editing}
      />
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  function handle() {
    if (!confirm("Excluir este orcamento?")) return;
    startTransition(async () => {
      try {
        await deleteBudget(id);
        toast({ title: "Orcamento excluido" });
      } catch (e: any) {
        toast({ title: "Erro", description: e?.message, variant: "destructive" });
      }
    });
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handle}
      disabled={pending}
      title="Excluir"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}

function BudgetFormDialog({
  open,
  onOpenChange,
  obraId,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obraId: string;
  editing: Budget | null;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [totalValue, setTotalValue] = useState(
    editing ? String(editing.totalValue) : ""
  );
  const [laborTotal, setLaborTotal] = useState(
    editing?.laborTotal != null ? String(editing.laborTotal) : ""
  );
  const [materialTotal, setMaterialTotal] = useState(
    editing?.materialTotal != null ? String(editing.materialTotal) : ""
  );
  const [description, setDescription] = useState(editing?.description ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      obraId,
      title,
      description: description || null,
      laborTotal: laborTotal ? Number(laborTotal) : null,
      materialTotal: materialTotal ? Number(materialTotal) : null,
      totalValue: Number(totalValue) || 0,
    };
    startTransition(async () => {
      try {
        if (editing) await updateBudget(editing.id, payload);
        else await createBudget(payload);
        toast({ title: editing ? "Orcamento atualizado" : "Orcamento criado" });
        onOpenChange(false);
        setTitle("");
        setTotalValue("");
        setLaborTotal("");
        setMaterialTotal("");
        setDescription("");
      } catch (e: any) {
        setError(e?.message ?? "Erro ao salvar");
      }
    });
  }

  const titleKey: string = editing?.id ?? "new";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={titleKey}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar Orcamento" : "Novo Orcamento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Titulo *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Orcamento total, Orcamento parede"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Valor total *</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mao de obra</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={laborTotal}
                onChange={(e) => setLaborTotal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Material</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={materialTotal}
                onChange={(e) => setMaterialTotal(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descricao</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esta incluso, condicoes, prazo..."
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded p-2">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
