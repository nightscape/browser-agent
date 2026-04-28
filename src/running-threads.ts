import { useSyncExternalStore } from "react";

let snapshot = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function setThreadRunning(id: string, running: boolean): void {
  const had = snapshot.has(id);
  if (running === had) return;
  snapshot = new Set(snapshot);
  if (running) snapshot.add(id);
  else snapshot.delete(id);
  notify();
}

export function useIsThreadRunning(id: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot.has(id),
    () => false,
  );
}
