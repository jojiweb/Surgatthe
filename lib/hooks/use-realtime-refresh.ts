"use client";

/**
 * Hook reutilizavel: assina canais Realtime do Supabase e chama
 * router.refresh() em qualquer evento (INSERT/UPDATE/DELETE) das
 * tabelas observadas. Re-busca os dados via server component sem
 * que o usuario precise dar refresh manual.
 *
 * Uso:
 *   useRealtimeRefresh("Obra");
 *   useRealtimeRefresh(["Obra", "DayLog", "DayLogEntry"]);
 */
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function useRealtimeRefresh(table: string | string[]) {
  const router = useRouter();
  const tables = useMemo(
    () => (Array.isArray(table) ? table : [table]),
    // serialize para deps estavel
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Array.isArray(table) ? table.join(",") : table]
  );

  useEffect(() => {
    const supabase = createClient();
    const channelName = `refresh-${tables.join("-")}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    let channel = supabase.channel(channelName);

    tables.forEach((t) => {
      channel = (channel as any).on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        () => router.refresh()
      );
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tables, router]);
}
