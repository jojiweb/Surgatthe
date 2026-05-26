import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ObraForm } from "@/components/obras/obra-form";
import { Button } from "@/components/ui/button";

export default function NovaObraPage() {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/obras">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Nova Obra</h1>
      <ObraForm mode="create" />
    </div>
  );
}
