import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importWithChunkReload } from "./lazyWithRetry";

describe("importWithChunkReload", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("reloads once on chunk load failure then rethrows if import still fails", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload },
      writable: true,
      configurable: true,
    });

    const chunkError = new Error(
      "Failed to fetch dynamically imported module: https://example.com/assets/Grooming.js",
    );
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(chunkError)
      .mockRejectedValueOnce(chunkError);

    void importWithChunkReload(importFn);
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("woof:chunk-reload")).toBe("1");

    await expect(importWithChunkReload(importFn)).rejects.toThrow(
      /Failed to fetch dynamically imported module/,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("woof:chunk-reload")).toBeNull();
  });

  it("clears reload flag after a successful import", async () => {
    sessionStorage.setItem("woof:chunk-reload", "1");
    const importFn = vi.fn().mockResolvedValue({ default: () => null });

    await expect(importWithChunkReload(importFn)).resolves.toEqual({
      default: expect.any(Function),
    });
    expect(sessionStorage.getItem("woof:chunk-reload")).toBeNull();
  });
});
