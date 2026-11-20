import { useSyncExternalStore } from "react";

/** Profile picture of the signed-in Google/Clerk account (null for guests and password users). */
let avatarUrl: string | null = null;
const listeners = new Set<() => void>();

export function setAvatarUrl(next: string | null) {
  if (next === avatarUrl) return;
  avatarUrl = next;
  listeners.forEach((l) => l());
}

export function useAvatarUrl(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => avatarUrl,
    () => null,
  );
}
