"use client";

import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type State = { toasts: ToasterToast[] };

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function setState(updater: (s: State) => State) {
  memoryState = updater(memoryState);
  listeners.forEach((l) => l(memoryState));
}

function genId() {
  return Math.random().toString(36).slice(2);
}

export function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  const newToast: ToasterToast = { ...props, id, open: true };
  setState((s) => ({
    toasts: [newToast, ...s.toasts].slice(0, TOAST_LIMIT),
  }));
  setTimeout(() => {
    setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }, TOAST_REMOVE_DELAY);
  return id;
}

export function useToast() {
  const [state, setLocal] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setLocal);
    return () => {
      const idx = listeners.indexOf(setLocal);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (id: string) =>
      setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
}
