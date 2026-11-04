import { describe, expect, it, vi } from "vitest";

import { SharedImageFetchService } from "../shared-image-fetch-service";

describe("shared image downloads", () => {
  it("lets an active viewer adopt its in-flight prefetch during effect cleanup", async () => {
    const pending = Promise.withResolvers<Blob>();
    const service = {
      fetchBlob: vi.fn(() => pending.promise),
      cleanup: vi.fn(),
    };
    const coordinator = new SharedImageFetchService(() => service);
    const prefetch = coordinator.createConsumer();
    const active = coordinator.createConsumer();
    const old = prefetch
      .fetchBlob("display.jpg")
      .catch((error: Error) => error);
    prefetch.cleanup();
    const current = active.fetchBlob("display.jpg");
    await Promise.resolve();
    expect(service.fetchBlob).toHaveBeenCalledOnce();
    expect(service.cleanup).not.toHaveBeenCalled();
    const blob = new Blob(["image"]);
    pending.resolve(blob);
    expect(await current).toBe(blob);
    expect(await old).toMatchObject({ name: "AbortError" });
    coordinator.dispose();
  });

  it("aborts an abandoned download once the last consumer leaves", async () => {
    const pending = Promise.withResolvers<Blob>();
    const service = {
      fetchBlob: vi.fn(() => pending.promise),
      cleanup: vi.fn(),
    };
    const coordinator = new SharedImageFetchService(() => service);
    const consumer = coordinator.createConsumer();
    const request = consumer
      .fetchBlob("display.jpg")
      .catch((error: Error) => error);
    consumer.cleanup();
    await Promise.resolve();
    expect(service.cleanup).toHaveBeenCalledOnce();
    expect(await request).toMatchObject({ name: "AbortError" });
  });
});
