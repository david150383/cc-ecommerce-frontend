import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are off, so Testing Library cannot register its own cleanup: unmount after each test.
afterEach(cleanup);

// Recent Node versions define their own global `localStorage` (only usable with --localstorage-file),
// which shadows jsdom's. Tests need a working Web Storage: install an in-memory one when it is broken.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name]?.setItem !== "function") {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true });
  }
}
