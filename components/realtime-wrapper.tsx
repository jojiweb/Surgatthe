"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

export function RealtimeWrapper({ tables }: { tables: string | string[] }) {
  useRealtimeRefresh(tables);
  return null;
}
