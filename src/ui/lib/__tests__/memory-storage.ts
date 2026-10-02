import { vi } from "vitest";

/**
 * Node 22+'s experimental global `localStorage` shadows jsdom's under Vitest
 * and isn't a functioning Storage object without `--localstorage-file`, so
 * auth tests stub a small in-memory Storage instead (see articles.test.ts).
 * Call from `beforeEach`; `vi.unstubAllGlobals()` restores the original.
 */
export function stubMemoryLocalStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}
