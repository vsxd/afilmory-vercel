import fs from "node:fs";

import { describe, expect, it } from "vitest";

const requiredStorageFields = [
  "S3_BUCKET_NAME",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "S3_ENDPOINT",
];

describe("Vercel Deploy Button configuration", () => {
  it.each(["README.md", "README.zh-CN.md"])(
    "%s keeps optional fields out of the main form and provides a CDN entry",
    (file) => {
      const content = fs.readFileSync(
        new URL(`../${file}`, import.meta.url),
        "utf8",
      );
      const links = content.match(
        /https:\/\/vercel\.com\/new\/clone\?[^"\s)]+/g,
      );
      expect(links).toHaveLength(3);
      const buttons = links!.map((link) => new URL(link));
      expect(buttons[0].href).toBe(buttons[1].href);
      expect(buttons[0].searchParams.get("env")?.split(",")).toEqual(
        requiredStorageFields,
      );
      expect(buttons[2].searchParams.get("env")?.split(",")).toEqual([
        ...requiredStorageFields,
        "S3_CUSTOM_DOMAIN",
      ]);

      for (const button of buttons) {
        expect(button.searchParams.get("repository-url")).toBe(
          "https://github.com/vsxd/afilmory-vercel",
        );
        // Only non-sensitive defaults belong in a public URL. Do not add empty
        // optional defaults: envDefaults does not make required fields optional.
        expect(JSON.parse(button.searchParams.get("envDefaults")!)).toEqual({
          S3_REGION: "us-east-1",
          S3_ENDPOINT: "https://s3.us-east-1.amazonaws.com",
        });
        expect(button.searchParams.get("envLink")).toContain("#s3-");
      }
    },
  );
});
