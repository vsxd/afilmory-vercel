/* eslint-disable unicorn/prefer-single-call */
import { format as utilFormat } from "node:util";

import type {
  BuilderResult,
  BuildProgressListener,
  BuildProgressSnapshot,
  BuildProgressStartPayload,
} from "../builder/builder.js";
import type { LogMessage } from "../logger/index.js";

type RunStatus = "idle" | "running" | "success" | "error";

interface RunMetadata {
  runMode: string;
  concurrency: number;
  processingMode: "cluster" | "worker";
}

interface ProgressState extends BuildProgressSnapshot {}

interface SummaryState {
  durationMs: number;
  result: BuilderResult;
}

interface TuiState {
  status: RunStatus;
  runMeta: RunMetadata | null;
  progress: ProgressState | null;
  summary: SummaryState | null;
  error: string | null;
  logs: string[];
}

const MAX_LOG_LINES = 15;

export class BuilderTUI {
  private readonly stream: NodeJS.WriteStream;
  private state: TuiState = {
    status: "idle",
    runMeta: null,
    progress: null,
    summary: null,
    error: null,
    logs: [],
  };
  private lastFrame = "";
  private isAttached = false;
  private startTimestamp: number | null = null;

  constructor(options: { stream?: NodeJS.WriteStream } = {}) {
    this.stream = options.stream ?? process.stdout;
  }

  attach(): void {
    if (this.isAttached) return;
    this.isAttached = true;
    this.hideCursor();
    this.render(true);
  }

  detach(): void {
    if (!this.isAttached) return;
    this.clearScreen();
    this.showCursor();
    this.isAttached = false;
    this.lastFrame = "";

    if (this.state.status === "success" && this.state.summary) {
      const summaryLine = this.formatSuccessSummary(this.state.summary);
      this.stream.write(`${summaryLine}\n`);
    } else if (this.state.status === "error" && this.state.error) {
      this.stream.write(`${color("构建失败：", "red")}${this.state.error}\n`);
    }
  }

  setRunMetadata(meta: RunMetadata): void {
    this.state.runMeta = meta;
    this.render();
  }

  handleLog(message: LogMessage): void {
    const timestamp = formatTime(message.timestamp);
    const levelLabel = formatLevel(message.level);
    const formatted = utilFormat(...(message.args as any[]));
    const line = `${color(timestamp, "gray")} ${levelLabel} ${color(`[${message.tag}]`, "blue")} ${formatted}`;
    this.state.logs = [...this.state.logs, line].slice(-MAX_LOG_LINES);
    this.render();
  }

  createProgressListener(): BuildProgressListener {
    return {
      onStart: (payload: BuildProgressStartPayload) => {
        this.startTimestamp = Date.now();
        this.state.status = "running";
        this.state.progress = {
          total: payload.total,
          completed: 0,
          newCount: 0,
          processedCount: 0,
          skippedCount: 0,
          failedCount: 0,
        };
        this.render(true);
      },
      onProgress: (snapshot: BuildProgressSnapshot) => {
        this.state.progress = { ...snapshot };
        this.render();
      },
      onComplete: (snapshot: BuildProgressSnapshot) => {
        this.state.progress = { ...snapshot };
        this.render();
      },
      onError: (error: unknown) => {
        this.markError(error);
      },
    };
  }

  markSuccess(result: BuilderResult): void {
    const durationMs = this.startTimestamp
      ? Date.now() - this.startTimestamp
      : 0;
    this.state.status = "success";
    this.state.summary = { durationMs, result };
    this.render();
  }

  markError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.state.status = "error";
    this.state.error = message;
    this.render();
  }

  private render(force = false): void {
    if (!this.isAttached) return;

    const frame = this.composeFrame();
    if (!force && frame === this.lastFrame) {
      return;
    }
    this.lastFrame = frame;

    this.clearScreen();
    this.stream.write(frame);
  }

  private composeFrame(): string {
    const columns = this.stream.columns ?? 80;
    const lines: string[] = [];

    lines.push(this.composeHeader(columns));
    lines.push("");
    lines.push(this.composeProgress(columns));
    lines.push("");
    lines.push(this.composeStatusLine());
    lines.push("");
    lines.push(color("最近日志：", "gray"));
    lines.push(
      ...(this.state.logs.length > 0
        ? this.state.logs
        : [color("暂无日志输出…", "gray")]),
    );

    return lines.join("\n");
  }

  private composeHeader(columns: number): string {
    const meta = this.state.runMeta;
    if (!meta) {
      return color("📸 Afilmory Builder", "cyan");
    }
    const parts = [
      color("📸 Afilmory Builder", "cyan"),
      `模式: ${color(meta.runMode, "green")}`,
      `处理: ${color(meta.processingMode === "cluster" ? "多进程集群" : "并发线程池", "green")}`,
      `并发: ${color(String(meta.concurrency), "green")}`,
    ];
    const header = parts.join(" · ");
    return header.length > columns ? header.slice(0, columns - 1) : header;
  }

  private composeProgress(columns: number): string {
    const { progress } = this.state;
    if (!progress) {
      switch (this.state.status) {
        case "success": {
          return color("构建已完成", "green");
        }
        case "error": {
          return color("构建出现错误", "red");
        }
        case "running": {
          return color("准备处理中…", "yellow");
        }
        default: {
          return color("等待开始…", "yellow");
        }
      }
    }

    const barWidth = Math.max(10, Math.min(40, columns - 40));
    const ratio =
      progress.total > 0
        ? Math.min(1, Math.max(0, progress.completed / progress.total))
        : 1;
    const filledLength = Math.round(ratio * barWidth);
    const bar = `${"█".repeat(filledLength)}${"░".repeat(Math.max(0, barWidth - filledLength))}`;
    const percent = progress.total > 0 ? (ratio * 100).toFixed(1) : "100";
    const segments = [
      `新 ${progress.newCount}`,
      `更新 ${progress.processedCount}`,
      `跳过 ${progress.skippedCount}`,
    ];
    if (progress.failedCount > 0) {
      segments.push(`失败 ${progress.failedCount}`);
    }
    const counts = segments.join(" · ");

    const parts = [
      `处理照片 [${bar}] ${percent}% (${progress.completed}/${progress.total})`,
      counts,
    ];
    if (progress.currentKey) {
      parts.push(`当前: ${truncateMiddle(progress.currentKey, columns - 10)}`);
    }

    return parts.join("\n");
  }

  private composeStatusLine(): string {
    switch (this.state.status) {
      case "success": {
        if (this.state.summary) {
          return this.formatSuccessSummary(this.state.summary);
        }
        return color("构建完成", "green");
      }
      case "error": {
        return color(`构建失败：${this.state.error ?? "未知错误"}`, "red");
      }
      case "running": {
        return color("构建进行中…", "yellow");
      }
      default: {
        return color("等待开始…", "gray");
      }
    }
  }

  private formatSuccessSummary(summary: SummaryState): string {
    const { result, durationMs } = summary;
    const durationSeconds = Math.round(durationMs / 1000);
    return color(
      `✅ 构建成功 · 照片 ${result.totalPhotos} · 新增 ${result.newCount} · 更新 ${result.processedCount} · 删除 ${result.deletedCount} · 耗时 ${formatDuration(durationSeconds)}`,
      "green",
    );
  }

  private clearScreen(): void {
    this.stream.write("\u001b[0;0H");
    this.stream.write("\u001b[2J");
  }

  private hideCursor(): void {
    this.stream.write("\u001b[?25l");
  }

  private showCursor(): void {
    this.stream.write("\u001b[?25h");
  }
}

function color(
  text: string,
  tone: "cyan" | "green" | "yellow" | "red" | "gray" | "blue" | "magenta",
): string {
  const codes: Record<typeof tone, string> = {
    cyan: "\u001b[36m",
    green: "\u001b[32m",
    yellow: "\u001b[33m",
    red: "\u001b[31m",
    gray: "\u001b[90m",
    blue: "\u001b[34m",
    magenta: "\u001b[35m",
  } as const;
  return `${codes[tone]}${text}\u001b[0m`;
}

function formatLevel(level: string): string {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case "error":
    case "fatal": {
      return color("ERR", "red");
    }
    case "warn": {
      return color("WRN", "yellow");
    }
    case "success": {
      return color("SUC", "green");
    }
    case "debug":
    case "trace": {
      return color("DBG", "magenta");
    }
    case "start": {
      return color("STA", "cyan");
    }
    default: {
      return color(normalized.slice(0, 3).toUpperCase(), "gray");
    }
  }
}

function formatTime(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}秒`;
  }
  return `${minutes}分${seconds}秒`;
}

function truncateMiddle(value: string, maxLength: number): string {
  const limit = Math.max(10, maxLength);
  if (value.length <= limit) {
    return value;
  }
  const half = Math.max(1, Math.floor((limit - 1) / 2));
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}
