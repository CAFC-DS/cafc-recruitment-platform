import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useState that survives leaving the page, a reload and opening a new browser tab.
 *
 * Values live in localStorage under the signed-in account, so people sharing a
 * machine never inherit each other's filters. The value is read synchronously on
 * first render because pages fetch, and seed draft state, from their first render.
 */

// useCurrentUser resolves after a request, too late for a first render. The claim
// only namespaces a UI preference; API authorisation still validates the token.
const currentAccount = (): string | null => {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part));
    const account = claims.user_id ?? claims.sub;
    return account === undefined || account === null ? null : String(account);
  } catch {
    return null;
  }
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Saved values can predate a filter being added or renamed, so only trust what
// still has the shape the page expects.
const reconcile = <T,>(saved: unknown, fallback: T): T => {
  if (Array.isArray(fallback)) return (Array.isArray(saved) ? saved : fallback) as T;
  if (isPlainObject(fallback)) {
    if (!isPlainObject(saved)) return fallback;
    const merged: Record<string, unknown> = { ...fallback, ...saved };
    Object.entries(fallback).forEach(([key, value]) => {
      if (value !== undefined) merged[key] = reconcile(saved[key], value);
    });
    return merged as T;
  }
  return typeof saved === typeof fallback ? (saved as T) : fallback;
};

interface PersistentStateOptions<T> {
  /** Adjust a restored value, e.g. to drop a saved page number. */
  restore?: (saved: T) => T;
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options?: PersistentStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = useRef<string | null>(null);
  const defaultJson = useRef(JSON.stringify(initialValue));

  const [value, setValue] = useState<T>(() => {
    const account = currentAccount();
    storageKey.current = account ? `persisted:v1:${account}:${key}` : null;
    if (!storageKey.current) return initialValue;
    try {
      const stored = localStorage.getItem(storageKey.current);
      if (stored === null) return initialValue;
      const saved = reconcile(JSON.parse(stored), initialValue);
      return options?.restore ? options.restore(saved) : saved;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (!storageKey.current) return;
    try {
      const json = JSON.stringify(value);
      if (json === defaultJson.current) localStorage.removeItem(storageKey.current);
      else localStorage.setItem(storageKey.current, json);
    } catch {
      // Storage full or blocked: the page still works, it just won't remember.
    }
  }, [value]);

  return [value, setValue];
}

const NO_IDS: number[] = [];

/** usePersistentState for a Set of numeric ids (JSON has no Set). */
export function usePersistentIdSet(key: string): [Set<number>, Dispatch<SetStateAction<Set<number>>>] {
  const [ids, setIds] = usePersistentState<number[]>(key, NO_IDS);
  const idSet = useMemo(() => new Set(ids.filter(Number.isInteger)), [ids]);
  const setIdSet = useCallback<Dispatch<SetStateAction<Set<number>>>>((next) => {
    setIds((previous) =>
      Array.from(typeof next === "function" ? next(new Set(previous)) : next),
    );
  }, [setIds]);
  return [idSet, setIdSet];
}
