# CLAUDE.md — Convencoes do Obras FG

Este arquivo orienta sessoes do Claude Code que vao mexer neste repo.
Toda feature nova deve seguir os "trilhos" abaixo para preservar a
otimizacao de performance ja feita.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind. Prisma -> Postgres do
Supabase. Supabase-js apenas para Auth, Realtime e Storage no browser.
Deploy na Vercel (regiao `gru1`).

## Trilhos de arquitetura (siga sempre)

### 1. Leitura de dados sempre cacheada por tag

NUNCA escreva uma query Prisma direto em `page.tsx` ou em um componente.
Crie uma funcao em `lib/data/<dominio>.ts` envolvida em `cached(...)`
(wrapper de `unstable_cache` em `lib/data/cache.ts`).

```ts
// lib/data/foo.ts
export const getFooCached = (id: string) =>
  cached(
    () => prisma.foo.findUnique({ where: { id }, select: { ... } }),
    ["foo", id],          // key parts
    [TAGS.foo(id)],       // tags para invalidacao
  )();
```

Use `select` (nunca `include` cego) para baixar so o que a UI usa.

### 2. Mutacao chama `revalidateTag` das tags afetadas

Em `lib/actions/<dominio>.ts`, ao fim de cada server action que altera
dados:

```ts
revalidateTag(TAGS.foo(id));
revalidateTag(TAGS.foos); // se a lista geral mudou
```

Nunca use `revalidatePath` (invalida demais), nunca use
`export const dynamic = "force-dynamic"` em pages (sai do cache).

### 3. Pagina = entry point, e so faz `requireUser()` + leituras cacheadas

```tsx
export default async function MinhaPage() {
  await requireUser();
  const data = await getFooCached(id);
  return <UI data={data} />;
}
```

`requireUser()` ja eh memoizado por `React.cache()` em `lib/auth.ts`.

### 4. Toda rota tem `loading.tsx`

Skeleton em `app/(app)/<rota>/loading.tsx` reusando
`components/ui/skeleton.tsx`. Navegacao percebida instantanea.

### 5. Upload de imagem sempre via `lib/upload-photos.ts`

```ts
const uploaded = await uploadPhotos(supabase, obraId, files, {
  concurrency: 3,
  onProgress: (done, total) => ...,
});
await createPhotosBatch({ obraId, storagePaths: uploaded.map(u => u.storagePath), ... });
```

Esse helper ja faz: compressao + thumb + upload paralelo com pool, lazy
import da lib pesada de compressao. Nao reimplemente o loop.

### 6. Server-first

Componente eh **server** por padrao. So coloque `"use client"` quando
precisa de estado, interacao, ou hooks do browser. Mantenha as ilhas
client pequenas.

### 7. Realtime

Use `useRealtimeRefresh(tabela | tabelas[])` em um wrapper client
(`components/realtime-wrapper.tsx`) dentro da page. Ja faz debounce
de 300ms. Como as leituras sao cacheadas, o refresh so toca o banco
quando uma tag foi revalidada por uma mutacao.

## Convencao de tags

Definidas em `lib/data/cache.ts`:

| Tag                | Invalidada por                  |
| ------------------ | ------------------------------- |
| `obras`            | create/update/delete obra       |
| `obra:{id}`        | update/delete obra, budgets, ... |
| `salaries`         | createDayLog, futuro Payment/Absence |
| `fotos:{obraId}`   | upload, delete, togglePortfolio |
| `dias:{obraId}`    | createDayLog                    |
| `members`          | create/update/delete member     |

Ao adicionar feature nova: defina uma tag, declare em `TAGS`, use no
`cached(...)` e nas mutacoes.

## Banco

- `DATABASE_URL` = pooled (porta 6543) — runtime.
- `DIRECT_URL` = direta (5432) — migrations.
- Sempre adicione `@@index([campo])` para colunas usadas em WHERE/ORDER BY.
- Cascade delete onde a integridade exige.

## Storage de fotos

- Bucket `obra-fotos` privado.
- Convencao: `{obraId}/{uuid}.jpg` (full) + `{obraId}/{uuid}_thumb.jpg`.
- `lib/storage.ts:thumbPath()` deriva o caminho do thumb.
- Signed URLs geradas no SERVIDOR (service role) por 1h, cacheadas 50min
  via `getObraPhotosCached`. Nunca exponha service role no browser.

## Comandos uteis

```bash
npm run dev                    # dev
npm run build                  # build prod
npx prisma migrate dev --name x  # nova migration em dev
npx prisma migrate deploy      # aplicar em prod
npm run db:seed                # popular dados de exemplo
npx tsc --noEmit               # type-check rapido
```

## Quando NAO seguir esses trilhos

So abra excecao se houver razao tecnica forte (ex.: query agregada
custom que `unstable_cache` nao consegue serializar). Documente no
codigo o porque.
