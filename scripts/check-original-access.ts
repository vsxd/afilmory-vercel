export type OriginalAccessCode =
  | "ok"
  | "invalid-url"
  | "forbidden"
  | "not-found"
  | "http-error"
  | "not-image"
  | "cors"
  | "timeout"
  | "network";

export interface OriginalAccessResult {
  code: OriginalAccessCode;
  message: string;
}

/** An advisory, anonymous sample; never include photo URLs or fetch errors in logs. */
export async function checkOriginalAccess(
  originalUrl: string,
  siteUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<OriginalAccessResult> {
  let original: URL;
  let site: URL;
  try {
    site = new URL(siteUrl);
    original = new URL(originalUrl, site);
    if (
      !["http:", "https:"].includes(original.protocol) ||
      original.username ||
      original.password ||
      !["http:", "https:"].includes(site.protocol)
    ) {
      throw new Error("Invalid public URL");
    }
  } catch {
    return {
      code: "invalid-url",
      message: "Check SITE_URL and the public original URL configuration.",
    };
  }

  const controller = new AbortController();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<OriginalAccessResult>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({
        code: "timeout",
        message:
          "The sampled original did not respond within 5 seconds. Check CDN availability and retry after deployment.",
      });
    }, 5_000);
  });

  try {
    return await Promise.race([
      deadline,
      (async (): Promise<OriginalAccessResult> => {
        response = await fetcher(original, {
          signal: controller.signal,
          credentials: "omit",
          headers: { Origin: site.origin, Range: "bytes=0-1023" },
        });
        // A custom transport may resolve after the deadline despite abort.
        // The caller's finally has already run in that case; release here.
        if (controller.signal.aborted) {
          if (response.body) void response.body.cancel().catch(() => {});
          return {
            code: "timeout",
            message: "The sampled original timed out after 5 seconds.",
          };
        }
        if (response.status === 401 || response.status === 403) {
          return {
            code: "forbidden",
            message:
              `The sampled original returned HTTP ${response.status} without credentials. ` +
              "Builder credentials do not grant visitors access; check public object permissions or S3_CUSTOM_DOMAIN.",
          };
        }
        if (response.status === 404) {
          return {
            code: "not-found",
            message:
              "The sampled original returned HTTP 404. Check S3_CUSTOM_DOMAIN, S3_PREFIX, and the public object path.",
          };
        }
        if (!response.ok) {
          return {
            code: "http-error",
            message: `The sampled original returned HTTP ${response.status}. Check the public storage/CDN endpoint.`,
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!response.body) {
          return {
            code: "not-image",
            message:
              "The sampled original returned no image data. Check the public object and CDN response.",
          };
        }
        // Some object stores legitimately use application/octet-stream or no
        // MIME type. Only reject clear error documents, not unfamiliar images.
        let isErrorDocument = /\b(?:html|json|xml)\b/i.test(contentType);
        if (!isErrorDocument) {
          reader = response.body.getReader();
          const { value } = await reader.read();
          if (!value?.byteLength) {
            return {
              code: "not-image",
              message:
                "The sampled original returned no image data. Check the public object and CDN response.",
            };
          }
          const prefix = new TextDecoder()
            .decode(value?.subarray(0, 256))
            .trim();
          isErrorDocument =
            /^(?:<!doctype\s+html|<html\b|<\?xml\b|<Error\b)/i.test(prefix);
        }
        if (isErrorDocument) {
          return {
            code: "not-image",
            message:
              "The sampled original returned an HTML/JSON/XML document instead of an image. Check CDN routing and public object permissions.",
          };
        }

        const finalOrigin = response.url
          ? new URL(response.url).origin
          : original.origin;
        const allowOrigin = response.headers.get("access-control-allow-origin");
        if (
          (original.origin !== site.origin || finalOrigin !== site.origin) &&
          allowOrigin !== "*" &&
          allowOrigin !== site.origin
        ) {
          return {
            code: "cors",
            message:
              "The sampled original lacks a matching Access-Control-Allow-Origin response. Allow the site origin (including Preview domains when used), or * for public photos, in storage/CDN CORS settings.",
          };
        }
        return {
          code: "ok",
          message:
            "One public original responded and passed the sampled CORS check; verify the deployed viewer to confirm browser access.",
        };
      })(),
    ]);
  } catch {
    // Errors can contain signed URLs. Keep diagnostics entirely allowlisted.
    return {
      code: controller.signal.aborted ? "timeout" : "network",
      message: controller.signal.aborted
        ? "The sampled original timed out after 5 seconds. Check CDN availability."
        : "The sampled original could not be fetched. Check the public endpoint, DNS, TLS, and CDN availability.",
    };
  } finally {
    clearTimeout(timeout);
    // Stop after the first chunk even when a server ignores Range. Do not wait
    // for the rest of the original or let cancellation extend the deadline.
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
    controller.abort();
  }
}
