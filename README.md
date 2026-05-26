# Obras FG

Sistema web para gestao de obras de **FG Construcoes & Reformas**.
Permite a 2 pessoas (Alexandre e Fabio) registrar presenca diaria,
acompanhar progresso por m2, montar orcamentos, subir fotos e ver
salarios em tempo real - via celular ou desktop.

> **Estagio atual:** Etapa 1 de 3. Tudo o que esta nesta pagina ja
> funciona. As etapas 2 e 3 (Equipe/Financeiro/Portfolio/Etapas/Notas)
> ficaram preparadas no banco mas aparecem como "Em breve" na UI.

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase: Postgres + Auth + Realtime + Storage privado (plano gratuito)
- Prisma ORM (schema, migrations e queries)
- Tailwind CSS + componentes estilo shadcn/ui
- Zod (validacao)
- browser-image-compression (compressao de fotos no navegador)
- Hospedagem: Vercel (app) + Supabase (backend)

## Setup do zero

### 1. Criar projeto no Supabase

1. Acesse https://supabase.com e crie um projeto novo (plano free).
2. Escolha uma regiao proxima (ex: `sa-east-1`).
3. Aguarde o provisionamento.

### 2. Pegar as connection strings e chaves

Em **Project Settings**:

- **Database -> Connection string -> Transaction (pooler)** -> copie para
  `DATABASE_URL` (porta 6543).
- **Database -> Connection string -> Direct** -> copie para `DIRECT_URL`
  (porta 5432).
- **API**:
  - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
  - `anon` `public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` (secret) -> `SUPABASE_SERVICE_ROLE_KEY`

### 3. Preencher .env

```bash
cp .env.example .env
# edite .env com os valores acima
```

### 4. Instalar dependencias e rodar migrations

```bash
npm install
npx prisma migrate deploy
```

(`postinstall` ja faz `prisma generate` automaticamente.)

### 5. Aplicar setup do Supabase (RLS + Realtime + Storage)

No painel do Supabase, abra **SQL Editor** e cole/execute o conteudo
inteiro de `supabase/setup.sql`.

### 6. Criar o bucket de fotos

No painel do Supabase, **Storage -> New bucket**:

- Nome: `obra-fotos`
- "Public bucket": **DESMARCADO** (deve ficar privado)

Depois, **se o setup.sql ainda nao foi executado**, execute-o agora -
ele cria as policies que permitem upload/leitura apenas para usuarios
autenticados.

### 7. Criar o usuario do login compartilhado

No painel do Supabase, **Authentication -> Users -> Add user -> Create
new user**:

- Email: `habboemail123321@gmail.com` (ou o que voce preferir)
- Password: `obras123` (troque assim que possivel)
- Marque **Auto Confirm User** (para nao precisar verificar email).

> Alternativa: em **Authentication -> Providers -> Email**, desmarque
> "Confirm email" para que novos usuarios entrem sem precisar de link.

### 8. Rodar o seed (Members, Obra de exemplo, tabela de precos)

```bash
npm run db:seed
```

Isso cria:

- 2 Members: Alexandre e Fabio (diaria padrao R$ 130).
- 1 Obra de exemplo "Cobertura Setor Bueno (exemplo)" com 2 servicos e
  2 orcamentos.
- Tabela de referencia de precos por servico.

### 9. Subir local

```bash
npm run dev
```

Abra http://localhost:3000 e faca login com o usuario criado no passo 7.

### 10. Deploy na Vercel

1. Importe o repositorio no painel da Vercel.
2. Em **Environment Variables**, configure as 5 variaveis do `.env`.
3. Deploy. A build roda `prisma generate && next build` automaticamente.

## Arquitetura - notas importantes

- **Prisma faz dados, Supabase-js faz auth/realtime/storage.** O browser
  nao acessa tabelas direto - tudo passa por server actions.
- **Sessao via cookies.** `middleware.ts` redireciona rotas privadas para
  `/login`.
- **Realtime como sinal.** O hook `useRealtimeRefresh` assina eventos das
  tabelas e dispara `router.refresh()` - re-busca os dados do servidor.
- **Storage privado.** Fotos sao acessadas via signed URLs geradas no
  servidor (validade 1h, regeneradas a cada page load).
- **Compressao no browser.** Antes do upload, fotos vao de 3-8 MB para
  ~300-700 KB sem perder qualidade visual perceptivel.

## O que ja funciona (Etapa 1)

- Login compartilhado (email + senha).
- Layout: sidebar (desktop) + bottom nav (mobile) + PWA instalavel.
- Dashboard com cards de resumo e lista de obras em andamento.
- Modulo Obras: listar, criar, editar e detalhar (Visao Geral, Servicos,
  Orcamentos, Dias, Fotos).
- "Adicionar Dia" em stepper de 7 passos com suporte a dia dividido
  entre 2 obras, recalculo automatico de progresso por m2, gastos e
  fotos.
- Salarios: total acumulado, por obra e historico - para Alexandre e
  Fabio - com a funcao completa (bruto - descontos - pago).
- Orcamentos: varios por obra, com botao "Copiar" para colar no WhatsApp.
- Fotos: 3 albuns (Antes/Durante/Depois), upload com compressao,
  visualizacao via signed URL, marcador "portfolio".
- Atualizacoes em tempo real via Supabase Realtime.

## O que esta preparado mas sem UI (Etapas 2 e 3)

- Tabelas: `Etapa`, `Absence`, `Payment`, `ObraNote`, `ServicePriceTable`.
- Campo `Member.authUserId` ja existe (nulo enquanto login eh
  compartilhado) - sera usado quando cada membro tiver login proprio.
- Itens "Em breve" na navegacao: Equipe, Financeiro, Portfolio, Etapas,
  Notas, Configuracoes.
- Funcao `calculateSalary` ja considera Absence e Payment - quando a UI
  for criada na Etapa 2, ela nao precisa mudar.

## Comandos

```bash
npm run dev          # dev server
npm run build        # build de producao
npm run db:migrate   # aplicar nova migration em dev
npm run db:deploy    # aplicar migrations em prod (sem prompt)
npm run db:seed      # popular dados de exemplo
npm run db:studio    # GUI do Prisma
```

## Estrutura

```
/app           - rotas (App Router)
/components    - componentes reutilizaveis (ui, layout, obras, dias)
/lib           - prisma, supabase clients, auth, storage, hooks, actions
/prisma        - schema.prisma + seed.ts
/supabase      - setup.sql (RLS + Realtime + Storage policies)
/public        - icons, manifest
```

## Pronto para Etapa 2

A base esta consolidada. A Etapa 2 vai adicionar UI para Equipe (faltas
e pagamentos) e Financeiro (calculo do "tio") - **sem precisar mexer no
schema** e sem mudar a funcao de salario.
