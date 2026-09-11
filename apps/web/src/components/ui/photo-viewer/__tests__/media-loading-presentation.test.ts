import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { getMediaTaskDiagnostic, MediaTaskError } from "~/lib/media-task";

import { presentMediaTaskError } from "../media-loading-presentation";

const t = ((key: string) => key) as TFunction;

describe("photo loading failure presentation", () => {
  it.each([
    [
      new MediaTaskError("fetch", "http", "HTTP 403", { httpStatus: 403 }),
      "forbidden",
    ],
    [
      new MediaTaskError("fetch", "http", "HTTP 404", { httpStatus: 404 }),
      "not-found",
    ],
    [
      new MediaTaskError("fetch", "http", "HTTP 503", { httpStatus: 503 }),
      "server",
    ],
    [new MediaTaskError("fetch", "timeout", "stalled"), "timeout"],
    [new MediaTaskError("fetch", "network", "unreachable"), "network"],
    [new MediaTaskError("detect", "invalid-image", "HTML"), "invalid-image"],
    [
      new MediaTaskError("detect", "detection-failed", "bad format"),
      "invalid-image",
    ],
    [new MediaTaskError("decode", "decode-failed", "codec"), "unsupported"],
    [
      new MediaTaskError("convert", "conversion-failed", "codec"),
      "unsupported",
    ],
    [new Error("unclassified"), "unknown"],
  ] as const)("classifies %s as %s", (error, reason) => {
    expect(presentMediaTaskError(error, t)).toEqual({
      isVisible: true,
      isError: true,
      errorMessage: `photo.error.${reason}.title`,
      errorDescription: `photo.error.${reason}.description`,
    });
  });

  it("keeps signed URLs and causes out of user messages and console diagnostics", () => {
    const fixtureUrl = new URL("https://example.test/photo.jpg");
    fixtureUrl.username = "fixture-user";
    fixtureUrl.password = "fixture-password";
    fixtureUrl.searchParams.set("X-Amz-Signature", "private");
    fixtureUrl.hash = "secret";
    const url = fixtureUrl.toString();
    const error = new MediaTaskError("fetch", "http", url, {
      httpStatus: 403,
      cause: new Error(url),
    });
    expect(getMediaTaskDiagnostic(error)).toEqual({
      stage: "fetch",
      code: "http",
      httpStatus: 403,
    });
    expect(JSON.stringify(presentMediaTaskError(error, t))).not.toContain(url);
    expect(getMediaTaskDiagnostic(new Error(url))).toEqual({ code: "unknown" });
  });

  it("does not diagnose every network failure as a confirmed CORS problem", () => {
    const error = new MediaTaskError("fetch", "network", "Failed to fetch");
    const diagnostics = getMediaTaskDiagnostic(error);
    expect(diagnostics.code).toBe("network");
    expect(diagnostics).toMatchObject({
      hint: expect.stringContaining("cannot identify which one"),
    });
    expect(presentMediaTaskError(error, t).errorMessage).toBe(
      "photo.error.network.title",
    );
  });
});
