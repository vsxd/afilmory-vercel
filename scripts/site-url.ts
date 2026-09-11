type SiteUrlEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    "SITE_URL" | "VERCEL" | "VERCEL_PROJECT_PRODUCTION_URL"
  >
>;

/** Resolve public metadata URLs without using a temporary preview hostname. */
export function resolveSiteUrl(
  environment: SiteUrlEnvironment,
  fallbackUrl: string,
): string {
  const explicitUrl = environment.SITE_URL?.trim();
  if (explicitUrl) {
    let url: URL;
    try {
      url = new URL(explicitUrl);
    } catch {
      throw new Error("SITE_URL must be an absolute http(s) URL");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      explicitUrl.includes("?") ||
      explicitUrl.includes("#")
    ) {
      throw new Error(
        "SITE_URL must be an http(s) URL without credentials, query parameters, or a fragment",
      );
    }
    return explicitUrl;
  }

  const hostname = environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (environment.VERCEL !== "1" || !hostname) return fallbackUrl;

  // Vercel supplies a hostname, not a URL. Reject URL syntax, IP literals and
  // malformed DNS labels before adding the scheme; never echo the input.
  const labels = hostname.split(".");
  const validHostname =
    hostname.length <= 253 &&
    labels.length >= 2 &&
    /[a-z]/i.test(labels.at(-1) ?? "") &&
    labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
  if (!validHostname) {
    throw new Error(
      "VERCEL_PROJECT_PRODUCTION_URL must be a hostname without a scheme, port, path, credentials, query, or fragment; set SITE_URL to override it",
    );
  }

  return `https://${hostname.toLowerCase()}`;
}
