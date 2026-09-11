import { afterEach, describe, expect, it, vi } from "vitest";

import { checkOriginalAccess } from "./check-original-access";

const photoUrl = "https://cdn.example.com/private-name.jpg?signature=secret";
const siteUrl = "https://gallery.example.com";

afterEach(() => vi.useRealTimers());

function imageResponse(headers: HeadersInit = {}, status = 200) {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    headers,
    status,
  });
}

describe("public original deployment sample", () => {
  it.each(["*", siteUrl])(
    "accepts image data with CORS %s using an anonymous bounded GET",
    async (origin) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        imageResponse(
          {
            "Content-Type": "image/jpeg",
            "Access-Control-Allow-Origin": origin,
          },
          206,
        ),
      );
      const result = await checkOriginalAccess(photoUrl, siteUrl, fetcher);
      expect(result.code).toBe("ok");
      expect(fetcher).toHaveBeenCalledWith(new URL(photoUrl), {
        credentials: "omit",
        signal: expect.any(AbortSignal),
        headers: { Origin: siteUrl, Range: "bytes=0-1023" },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /signature|private-name|secret/,
      );
    },
  );

  it("accepts a same-origin image without CORS or a MIME type", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(imageResponse());
    expect(
      (await checkOriginalAccess("/originals/photo.jpg", siteUrl, fetcher))
        .code,
    ).toBe("ok");
  });

  it.each([undefined, "https://other.example.com", `${siteUrl}/`])(
    "diagnoses missing or mismatched CORS without exposing the URL",
    async (origin) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          imageResponse(
            origin ? { "Access-Control-Allow-Origin": origin } : {},
          ),
        );
      const result = await checkOriginalAccess(photoUrl, siteUrl, fetcher);
      expect(result.code).toBe("cors");
      expect(result.message).toContain("Access-Control-Allow-Origin");
      expect(result.message).not.toContain(photoUrl);
    },
  );

  it("checks the destination of same-origin redirects", async () => {
    const response = imageResponse();
    Object.defineProperty(response, "url", { value: photoUrl });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(
      (await checkOriginalAccess("/original.jpg", siteUrl, fetcher)).code,
    ).toBe("cors");
  });

  it.each([204, 200])("rejects an empty HTTP %s response", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(status === 204 ? null : new Uint8Array(), {
        status,
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );
    expect((await checkOriginalAccess(photoUrl, siteUrl, fetcher)).code).toBe(
      "not-image",
    );
  });

  it.each([
    [401, "forbidden"],
    [403, "forbidden"],
    [404, "not-found"],
    [503, "http-error"],
  ] as const)("diagnoses HTTP %s before CORS", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(imageResponse({}, status));
    const result = await checkOriginalAccess(photoUrl, siteUrl, fetcher);
    expect(result.code).toBe(code);
    expect(result.message).toContain(`HTTP ${status}`);
  });

  it.each([
    ["text/html", "denied"],
    ["application/json", '{"error":"denied"}'],
    ["application/xml", "<Error>denied</Error>"],
    ["application/octet-stream", " <!DOCTYPE html><html>denied</html>"],
  ])("rejects a successful error document with %s", async (type, body) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(body, { headers: { "Content-Type": type } }),
      );
    expect((await checkOriginalAccess(photoUrl, siteUrl, fetcher)).code).toBe(
      "not-image",
    );
  });

  it("cancels the response after one chunk when the server ignores Range", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xd8]));
      },
      cancel,
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(body, { headers: { "Access-Control-Allow-Origin": "*" } }),
      );
    expect((await checkOriginalAccess(photoUrl, siteUrl, fetcher)).code).toBe(
      "ok",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("redacts network errors containing a signed original URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(photoUrl));
    const result = await checkOriginalAccess(photoUrl, siteUrl, fetcher);
    expect(result.code).toBe("network");
    expect(result.message).not.toMatch(/signature|private-name|secret/);
  });

  it.each(["headers", "body"])(
    "bounds stalled %s to five seconds",
    async (stage) => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(() =>
          stage === "headers"
            ? new Promise<Response>(() => {})
            : Promise.resolve(new Response(new ReadableStream<Uint8Array>())),
        );
      const pending = checkOriginalAccess(photoUrl, siteUrl, fetcher);
      await vi.advanceTimersByTimeAsync(5_000);
      expect((await pending).code).toBe("timeout");
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("releases a response that arrives after a transport ignores cancellation", async () => {
    vi.useFakeTimers();
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const pending = checkOriginalAccess(photoUrl, siteUrl, fetcher);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).code).toBe("timeout");
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    resolveResponse(new Response(body));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it.each(["file:///private/photo.jpg", "https://user:secret@example.com/x"])(
    "rejects unsupported or credentialed URLs before fetching",
    async (url) => {
      const fetcher = vi.fn<typeof fetch>();
      expect((await checkOriginalAccess(url, siteUrl, fetcher)).code).toBe(
        "invalid-url",
      );
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
