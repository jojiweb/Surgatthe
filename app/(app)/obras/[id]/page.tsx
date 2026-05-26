import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RealtimeWrapper } from "@/components/realtime-wrapper";
import { OverviewTab } from "@/components/obras/overview-tab";
import { ServicesTab } from "@/components/obras/services-tab";
import { BudgetsTab } from "@/components/obras/budgets-tab";
import { DaysTab } from "@/components/obras/days-tab";
import { PhotosTab } from "@/components/obras/photos-tab";
import { StatusBadge } from "@/components/obras/status-badge";
import { getObraById } from "@/lib/actions/obras";
import { getDayLogsByObra } from "@/lib/actions/dias";
import { prisma } from "@/lib/prisma";
import { getSignedUrls } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ObraDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const obra = await getObraById(params.id);
  if (!obra) notFound();

  const [dayEntries, photos] = await Promise.all([
    getDayLogsByObra(obra.id),
    prisma.obraPhoto.findMany({
      where: { obraId: obra.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Gera signed URLs em batch no servidor (validade 1h).
  const paths = photos.map((p) => p.storagePath);
  const urls = await getSignedUrls(paths);
  const photosWithUrls = photos.map((p) => ({
    ...p,
    signedUrl: urls[p.storagePath] ?? null,
  }));

  return (
    <div className="space-y-4">
      <RealtimeWrapper
        tables={["Obra", "ObraService", "Budget", "ObraPhoto", "DayLog", "DayLogEntry"]}
      />

      <Button variant="ghost" size="sm" asChild>
        <Link href="/obras">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{obra.clientName}</h1>
          <p className="text-sm text-muted-foreground">{obra.address}</p>
        </div>
        <StatusBadge status={obra.status} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Visao Geral</TabsTrigger>
          <TabsTrigger value="services">Servicos</TabsTrigger>
          <TabsTrigger value="budgets">Orcamentos</TabsTrigger>
          <TabsTrigger value="days">Dias</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
          <TabsTrigger value="etapas" disabled>
            Etapas
          </TabsTrigger>
          <TabsTrigger value="team" disabled>
            Equipe
          </TabsTrigger>
          <TabsTrigger value="finance" disabled>
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="notes" disabled>
            Notas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab obra={obra} />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab services={obra.services} />
        </TabsContent>
        <TabsContent value="budgets">
          <BudgetsTab
            obraId={obra.id}
            obraClientName={obra.clientName}
            budgets={obra.budgets}
          />
        </TabsContent>
        <TabsContent value="days">
          <DaysTab entries={dayEntries} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab obraId={obra.id} photos={photosWithUrls} />
        </TabsContent>
        <TabsContent value="etapas">
          <ComingSoon name="Etapas" />
        </TabsContent>
        <TabsContent value="team">
          <ComingSoon name="Equipe" />
        </TabsContent>
        <TabsContent value="finance">
          <ComingSoon name="Financeiro" />
        </TabsContent>
        <TabsContent value="notes">
          <ComingSoon name="Notas" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground">
        <strong>{name}</strong> chega na proxima etapa.
      </CardContent>
    </Card>
  );
}
