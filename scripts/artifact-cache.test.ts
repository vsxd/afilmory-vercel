import { describe, expect, it } from "vitest";

import { createAuthenticatedRepoUrl } from "./artifact-cache";

const TOKEN = "secret-token";

describe("createAuthenticatedRepoUrl", () => {
  it("embeds the token for https URLs", () => {
    const result = createAuthenticatedRepoUrl(
      "https://github.com/owner/repo.git",
      TOKEN,
    );
    expect(result).toBe(
      `https://x-access-token:${TOKEN}@github.com/owner/repo.git`,
    );
  });

  it("refuses to send the token over plaintext HTTP", () => {
    expect(() =>
      createAuthenticatedRepoUrl("http://example.com/repo.git", TOKEN),
    ).toThrow(/plaintext HTTP/);
  });

  it("does not leak the token in the thrown error message", () => {
    let message = "";
    try {
      createAuthenticatedRepoUrl("http://example.com/repo.git", TOKEN);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(TOKEN);
  });

  it("allows http only for localhost (local testing)", () => {
    expect(
      createAuthenticatedRepoUrl("http://localhost:3000/repo.git", TOKEN),
    ).toBe(`http://x-access-token:${TOKEN}@localhost:3000/repo.git`);
  });

  it("leaves scp-style git URLs untouched (cannot embed credentials)", () => {
    const scp = "git@github.com:owner/repo.git";
    expect(createAuthenticatedRepoUrl(scp, TOKEN)).toBe(scp);
  });
});
