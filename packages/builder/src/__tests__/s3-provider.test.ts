import { Buffer } from "node:buffer";

import type {
  DeleteObjectCommand,
  DeleteObjectCommandOutput,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  S3ClientLike,
  S3GetObjectOutput,
  S3SendOptions,
} from "../storage/providers/s3-provider.js";
import { S3StorageProvider } from "../storage/providers/s3-provider.js";

type MockS3Command =
  | DeleteObjectCommand
  | GetObjectCommand
  | ListObjectsV2Command
  | PutObjectCommand;

type MockS3Response =
  | DeleteObjectCommandOutput
  | S3GetObjectOutput
  | ListObjectsV2CommandOutput
  | PutObjectCommandOutput;

type MockS3Send = (
  command: MockS3Command,
  options?: S3SendOptions,
) => Promise<MockS3Response>;

class MockS3Client implements S3ClientLike {
  constructor(private readonly sendMock: MockS3Send) {}

  send(
    command: DeleteObjectCommand,
    options?: S3SendOptions,
  ): Promise<DeleteObjectCommandOutput>;
  send(
    command: GetObjectCommand,
    options?: S3SendOptions,
  ): Promise<S3GetObjectOutput>;
  send(
    command: ListObjectsV2Command,
    options?: S3SendOptions,
  ): Promise<ListObjectsV2CommandOutput>;
  send(
    command: PutObjectCommand,
    options?: S3SendOptions,
  ): Promise<PutObjectCommandOutput>;
  async send(
    command: MockS3Command,
    options?: S3SendOptions,
  ): Promise<MockS3Response> {
    return await this.sendMock(command, options);
  }
}

function createGetObjectResponse(
  response: Omit<S3GetObjectOutput, "$metadata">,
): S3GetObjectOutput {
  return { $metadata: {}, ...response };
}

function createListObjectsResponse(
  response: Omit<ListObjectsV2CommandOutput, "$metadata">,
): ListObjectsV2CommandOutput {
  return { $metadata: {}, ...response };
}

describe("S3StorageProvider.getFile", () => {
  const config = {
    provider: "s3" as const,
    bucket: "bucket",
    region: "auto",
    endpoint: "https://example.com",
    accessKeyId: "key",
    secretAccessKey: "secret",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the total timeout when the response body is already a Buffer", async () => {
    const send = vi.fn<MockS3Send>().mockResolvedValue(
      createGetObjectResponse({
        Body: Buffer.from("hello"),
        ContentLength: 5,
      }),
    );
    const provider = new S3StorageProvider(config, {
      s3Client: new MockS3Client(send),
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    await expect(provider.getFile("image.jpg")).resolves.toEqual(
      Buffer.from("hello"),
    );
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("clears the total timeout when the response body is missing", async () => {
    const send = vi
      .fn<MockS3Send>()
      .mockResolvedValue(createGetObjectResponse({}));
    const provider = new S3StorageProvider(config, {
      s3Client: new MockS3Client(send),
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    await expect(provider.getFile("image.jpg")).resolves.toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("paginates through truncated list responses for listAllFiles", async () => {
    const send = vi
      .fn<MockS3Send>()
      .mockResolvedValueOnce(
        createListObjectsResponse({
          Contents: [
            { Key: "a.jpg", Size: 1 },
            { Key: "b.mov", Size: 2 },
          ],
          IsTruncated: true,
          NextContinuationToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        createListObjectsResponse({
          Contents: [{ Key: "c.heic", Size: 3 }],
          IsTruncated: false,
        }),
      );
    const provider = new S3StorageProvider(config, {
      s3Client: new MockS3Client(send),
    });

    await expect(provider.listAllFiles()).resolves.toEqual([
      { key: "a.jpg", size: 1, lastModified: undefined, etag: undefined },
      { key: "b.mov", size: 2, lastModified: undefined, etag: undefined },
      { key: "c.heic", size: 3, lastModified: undefined, etag: undefined },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("respects maxFileLimit across paginated list responses", async () => {
    const send = vi
      .fn<MockS3Send>()
      .mockResolvedValueOnce(
        createListObjectsResponse({
          Contents: [{ Key: "a.jpg", Size: 1 }],
          IsTruncated: true,
          NextContinuationToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        createListObjectsResponse({
          Contents: [
            { Key: "b.jpg", Size: 2 },
            { Key: "c.jpg", Size: 3 },
          ],
          IsTruncated: true,
          NextContinuationToken: "page-3",
        }),
      );
    const provider = new S3StorageProvider(
      {
        ...config,
        maxFileLimit: 2,
      },
      {
        s3Client: new MockS3Client(send),
      },
    );

    await expect(provider.listImages()).resolves.toEqual([
      { key: "a.jpg", size: 1, lastModified: undefined, etag: undefined },
      { key: "b.jpg", size: 2, lastModified: undefined, etag: undefined },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("encodes object keys when generating public URLs", () => {
    const provider = new S3StorageProvider({
      ...config,
      customDomain: "https://cdn.example.com/",
    });

    expect(provider.generatePublicUrl("family/2024 #1?.jpg")).toBe(
      "https://cdn.example.com/family/2024%20%231%3F.jpg",
    );
  });
});
