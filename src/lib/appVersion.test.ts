import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteBuildId } from "./appVersion";

describe("fetchRemoteBuildId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns buildId from version.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ buildId: "abc123def456" }),
      }),
    );

    await expect(fetchRemoteBuildId()).resolves.toBe("abc123def456");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/version\.json\?ts=\d+$/),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns null on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );

    await expect(fetchRemoteBuildId()).resolves.toBeNull();
  });
});
