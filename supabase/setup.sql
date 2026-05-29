-- =====================================================================
-- setup.sql - configuracao do Supabase para o app Obras FG.
--
-- Execute este arquivo INTEIRO no SQL Editor do Supabase APOS ter
-- rodado `npx prisma migrate deploy` (as tabelas precisam existir).
--
-- Ele faz tres coisas:
--   1. Ativa Row Level Security em todas as tabelas de dominio
--   2. Cria policies do MVP: qualquer usuario autenticado tem acesso total
--      (sera refinado quando entrarem funcionarios/clientes no futuro)
--   3. Adiciona as tabelas relevantes a publication "supabase_realtime"
--   4. Cria policies do Storage para o bucket privado "obra-fotos"
--
-- O bucket "obra-fotos" deve ser criado PRIVADO via Dashboard:
--   Storage -> New bucket -> name="obra-fotos", "Public bucket" DESMARCADO.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Row Level Security em todas as tabelas
-- ---------------------------------------------------------------------
ALTER TABLE "Member"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Obra"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObraService"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Etapa"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLog"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLogEntry"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLogWorker"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLogServiceProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DayLogExpense"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Absence"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObraNote"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObraPhoto"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Budget"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServicePriceTable"     ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 2) Policies do MVP: usuario autenticado pode tudo.
--    Refinar quando entrarem WORKER e CLIENT na Etapa 3.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Member','Obra','ObraService','Etapa','DayLog','DayLogEntry',
    'DayLogWorker','DayLogServiceProgress','DayLogExpense','Absence',
    'Payment','ObraNote','ObraPhoto','Budget','ServicePriceTable'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_all" ON %I
         FOR ALL
         TO authenticated
         USING (true)
         WITH CHECK (true)', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3) Realtime: adicionar tabelas a publication.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Obra','ObraService','DayLog','DayLogEntry','ObraPhoto','Budget'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- tabela ja na publication, segue o jogo
      NULL;
    END;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3.5) Indices de performance (idempotentes).
--      Adicionados na otimizacao geral - rode este bloco se voce subiu
--      o schema com `prisma db push` (que nao cria estes indices).
--      Se voce roda `prisma migrate deploy` apos atualizar o schema,
--      essas indices ja vem da migration e este bloco eh no-op.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Obra_status_idx"                    ON "Obra"("status");
CREATE INDEX IF NOT EXISTS "DayLogWorker_dayLogEntryId_idx"     ON "DayLogWorker"("dayLogEntryId");
CREATE INDEX IF NOT EXISTS "Absence_memberId_date_idx"          ON "Absence"("memberId","date");
CREATE INDEX IF NOT EXISTS "Payment_memberId_paymentDate_idx"   ON "Payment"("memberId","paymentDate");


-- ---------------------------------------------------------------------
-- 4) Storage: policies para o bucket privado "obra-fotos".
--    Crie o bucket ANTES de rodar esta secao (via UI, marcado como privado).
--    Nenhum acesso publico - tudo via signed URL gerada no servidor.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "obra_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "obra_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "obra_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "obra_fotos_delete" ON storage.objects;

CREATE POLICY "obra_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'obra-fotos');

CREATE POLICY "obra_fotos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'obra-fotos');

CREATE POLICY "obra_fotos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'obra-fotos')
  WITH CHECK (bucket_id = 'obra-fotos');

CREATE POLICY "obra_fotos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'obra-fotos');
