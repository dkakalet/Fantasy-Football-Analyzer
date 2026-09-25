import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearMemoryCache } from "./cache";

describe("cached", () => {
  beforeEach(() => {
    process.env.FILE_CACHE = "0";
    clearMemoryCache();
    vi.useRealTimers();
  });

  it("serves from memory within the TTL and reloads after it", async () => {
    vi.useFakeTimers();
    const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    expect((await cached("k", 1000, loader)).value).toBe("a");
    const hit = await cached("k", 1000, loader);
    expect(hit).toMatchObject({ value: "a", from: "memory" });
    vi.advanceTimersByTime(1001);
    expect(await cached("k", 1000, loader)).toMatchObject({ value: "b", from: "network" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const loader = vi.fn().mockResolvedValue(1);
    await Promise.all([cached("k", 1000, loader), cached("k", 1000, loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serves a stale value when a refresh fails", async () => {
    vi.useFakeTimers();
    await cached("k", 1000, async () => "old");
    vi.advanceTimersByTime(1001);
    const res = await cached("k", 1000, async () => {
      throw new Error("down");
    });
    expect(res).toMatchObject({ value: "old", from: "stale", error: "down" });
  });

  it("throws when a load fails and nothing is cached", async () => {
    await expect(cached("k", 1000, async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
  });
});
