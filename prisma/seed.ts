/**
 * Seed do banco. Roda apos prisma migrate.
 *
 * NAO cria o usuario do Supabase Auth automaticamente - voce deve criar
 * manualmente no painel Authentication -> Users do Supabase com o email
 * configurado (ver README). Esse seed cuida apenas dos dados de dominio.
 */
import { ObraStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed iniciado...");

  // ServicePriceTable - tabela de referencia de precos (UI na Etapa 3)
  const services = [
    { serviceType: "Piso", defaultPricePerM2: 80 },
    { serviceType: "Pedra parede", defaultPricePerM2: 120 },
    { serviceType: "Cobertura", defaultPricePerM2: 150 },
    { serviceType: "Pintura", defaultPricePerM2: 35 },
    { serviceType: "Reboco", defaultPricePerM2: 45 },
  ];
  for (const s of services) {
    await prisma.servicePriceTable.upsert({
      where: { serviceType: s.serviceType },
      update: { defaultPricePerM2: s.defaultPricePerM2 },
      create: s,
    });
  }
  console.log(`-> ${services.length} ServicePriceTable upserted`);

  // Members - Alexandre e Fabio. authUserId fica nulo (login compartilhado).
  const alexandre = await prisma.member.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Alexandre",
      role: "ADMIN",
      dailyRate: 130,
    },
  });
  const fabio = await prisma.member.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Fabio",
      role: "ADMIN",
      dailyRate: 130,
    },
  });
  console.log(`-> Members: ${alexandre.name}, ${fabio.name}`);

  // Obra de exemplo
  const existingObra = await prisma.obra.findFirst({
    where: { clientName: "Cobertura Setor Bueno (exemplo)" },
  });

  if (!existingObra) {
    const obra = await prisma.obra.create({
      data: {
        clientName: "Cobertura Setor Bueno (exemplo)",
        address: "Rua T-25, 100 - Setor Bueno, Goiania",
        status: ObraStatus.EM_ANDAMENTO,
        startDate: new Date(),
        services: {
          create: [
            { type: "Pedra parede", totalM2: 120, pricePerM2: 120 },
            { type: "Piso", totalM2: 80, pricePerM2: 80 },
          ],
        },
        budgets: {
          create: [
            {
              title: "Orcamento total",
              description:
                "Inclui mao de obra e material para pedra parede e piso. Prazo estimado de 30 dias.",
              laborTotal: 12000,
              materialTotal: 8000,
              totalValue: 20800,
            },
            {
              title: "Orcamento piso",
              description: "Apenas mao de obra para assentamento do piso.",
              laborTotal: 6400,
              totalValue: 6400,
            },
          ],
        },
      },
    });
    console.log(`-> Obra criada: ${obra.id}`);
  } else {
    console.log("-> Obra de exemplo ja existe, pulando");
  }

  console.log("Seed finalizado com sucesso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
