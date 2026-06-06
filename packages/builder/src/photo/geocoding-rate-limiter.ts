import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sleep } from "../utils/backoff.js";

const INTERPROCESS_RATE_LIMIT_DIR = path.join(
  os.tmpdir(),
  "afilmory-geocoding-rate-limit",
);
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_STALE_TIMEOUT_MS = 5 * 60_000;
let rateLimitDirReady: Promise<void> | null = null;

const ensureRateLimitDir = async (): Promise<void> => {
  if (!rateLimitDirReady) {
    rateLimitDirReady = fs
      .mkdir(INTERPROCESS_RATE_LIMIT_DIR, { recursive: true })
      .then(() => {});
  }
  await rateLimitDirReady;
};

const hashKey = (key: string): string =>
  createHash("sha1").update(key).digest("hex");

const getRateLimitPaths = (
  key: string,
): { lockPath: string; timestampPath: string } => {
  const hashedKey = hashKey(key);
  return {
    lockPath: path.join(INTERPROCESS_RATE_LIMIT_DIR, `${hashedKey}.lock`),
    timestampPath: path.join(INTERPROCESS_RATE_LIMIT_DIR, `${hashedKey}.ts`),
  };
};

async function tryRemoveLock(lockPath: string): Promise<void> {
  await fs.rm(lockPath, { force: true }).catch(() => {});
}

const isLockStale = async (lockPath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT_MS;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

async function withInterprocessLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  await ensureRateLimitDir();
  const { lockPath } = getRateLimitPaths(key);

  while (true) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.write(`${process.pid}:${Date.now()}`);
      await handle.close();

      try {
        const result = await fn();
        return result;
      } finally {
        await tryRemoveLock(lockPath);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "EEXIST") {
        if (await isLockStale(lockPath)) {
          await tryRemoveLock(lockPath);
          continue;
        }
        await sleep(LOCK_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
}

export const applyInterprocessRateLimit = async (
  key: string,
  intervalMs: number,
): Promise<void> => {
  const { timestampPath } = getRateLimitPaths(key);

  await withInterprocessLock(key, async () => {
    let lastRequestTime = 0;
    try {
      const stat = await fs.stat(timestampPath);
      lastRequestTime = stat.mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < intervalMs) {
      await sleep(intervalMs - elapsed);
    }

    await fs.writeFile(timestampPath, `${Date.now()}`);
  });
};

export class SequentialRateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastTimestamp = 0;

  constructor(private readonly intervalMs: number) {}

  wait(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastTimestamp;
      const delay = elapsed < this.intervalMs ? this.intervalMs - elapsed : 0;

      if (delay > 0) {
        await sleep(delay);
      }

      this.lastTimestamp = Date.now();
    });

    return this.queue;
  }
}

const geocodingRateLimiters = new Map<string, SequentialRateLimiter>();

export const getRateLimiter = (
  key: string,
  intervalMs: number,
): SequentialRateLimiter => {
  const existing = geocodingRateLimiters.get(key);
  if (existing) {
    return existing;
  }

  const limiter = new SequentialRateLimiter(intervalMs);
  geocodingRateLimiters.set(key, limiter);
  return limiter;
};

export function resetGeocodingRateLimitersForTests(): void {
  geocodingRateLimiters.clear();
}
