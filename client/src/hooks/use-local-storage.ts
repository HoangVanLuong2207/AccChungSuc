import { useEffect, useState } from "react";

type Initializer<T> = T | (() => T);

function resolveInitialValue<T>(key: string, initialValue: Initializer<T>): T {
  if (typeof window === "undefined") {
    return typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue;
  }

  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      return JSON.parse(stored) as T;
    }
  } catch (error) {
    console.warn(`[useLocalStorage] Failed to read key "${key}":`, error);
  }

  return typeof initialValue === "function"
    ? (initialValue as () => T)()
    : initialValue;
}

export function useLocalStorage<T>(key: string, initialValue: Initializer<T>) {
  const [value, setValue] = useState<T>(() => resolveInitialValue(key, initialValue));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[useLocalStorage] Failed to write key "${key}":`, error);
    }
  }, [key, value]);

  return [value, setValue] as const;
}
