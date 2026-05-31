"use client";

/**
 * Hook reutilizavel: assina canais Realtime do Supabase e chama
 * router.refresh() (com debounce de 300ms) em qualquer evento das
 * tabelas observadas.
 *
 * Como o app usa Next Data Cache com tags, router.refresh() so toca
 * o banco se a tag tiver sido revalidada por uma mutacao - eventos
 * irrelevantes saem baratos.
 *
 * Uso:
 *   useRealtimeRefresh("Obra");
 *   useRealtimeRefresh(["Obra", "DayLog", "DayLogEntry"]);
 */
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 300;

export function useRealtimeRefresh(table: string | string[]) {
  const router = useRouter();
  const tables = useMemo(
    () => (Array.isArray(table) ? table : [table]),
    // serialize para deps estavel
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(table) ? table.join(",") : table]
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Nome estavel por conjunto de tabelas: evita criar canais novos a
    // cada mount (cleanup tira fora antes de inscrever de novo).
    const channelName = `refresh-${tables.join("-")}`;
    let channel = supabase.channel(channelName);

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, DEBOUNCE_MS);
    };

    tables.forEach((t) => {
      channel = (channel as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        scheduleRefresh
      );
    });

    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [tables, router]);
}
