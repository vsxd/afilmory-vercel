/** Only counts/timings cross the iframe boundary; never messages, URLs or EXIF. */
export function summarizeFrameIntervals(intervals: number[]) {
  const sorted = intervals
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    count: sorted.length,
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    p99Ms: round(percentile(0.99)),
    maxMs: round(sorted.at(-1) ?? 0),
    over50Ms: sorted.filter((value) => value > 50).length,
    over100Ms: sorted.filter((value) => value > 100).length,
  };
}

export interface DeviceMetrics {
  durationMs: number;
  frames: ReturnType<typeof summarizeFrameIntervals>;
  sampleLimitReached: boolean;
  longTasks: {
    supported: boolean;
    count: number;
    totalMs: number;
    maxMs: number;
  };
  contextLost: number;
  contextRestored: number;
  pageErrors: number;
  errorCounts?: {
    runtime: number;
    img: number;
    script: number;
    link: number;
    video: number;
    audio: number;
    other: number;
  };
  unhandledRejections: number;
  hiddenTransitions: number;
  viewport: { width: number; height: number; dpr: number };
}

const channel = "afilmory-device-check";

export function installDeviceProbe() {
  let active = false;
  let frameId = 0;
  let started = 0;
  let previous: number | null = null;
  let intervals: number[] = [];
  let observer: PerformanceObserver | undefined;
  let metrics: DeviceMetrics;
  let runId = 0;
  const instanceId = `${Date.now()}-${Math.random()}`;
  const post = (type: string, data?: DeviceMetrics) =>
    window.parent.postMessage(
      { channel, type, runId, instanceId, metrics: data },
      window.location.origin,
    );
  const recordLongTasks = (entries: PerformanceEntry[]) => {
    if (!active || document.hidden) return;
    for (const entry of entries) {
      if (entry.startTime < started) continue;
      metrics.longTasks.count++;
      metrics.longTasks.totalMs += entry.duration;
      metrics.longTasks.maxMs = Math.max(
        metrics.longTasks.maxMs,
        entry.duration,
      );
    }
  };
  const finish = () => {
    if (!active) return;
    recordLongTasks(observer?.takeRecords() ?? []);
    active = false;
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    metrics.durationMs = Math.round(performance.now() - started);
    metrics.frames = summarizeFrameIntervals(intervals);
    post("result", metrics);
    intervals = [];
  };
  const frame = (time: number) => {
    if (!active) return;
    if (!document.hidden && previous !== null) intervals.push(time - previous);
    previous = document.hidden ? null : time;
    if (intervals.length >= 60_000) {
      metrics.sampleLimitReached = true;
      finish();
      return;
    }
    frameId = requestAnimationFrame(frame);
  };
  const start = () => {
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    started = performance.now();
    previous = null;
    intervals = [];
    active = true;
    metrics = {
      durationMs: 0,
      frames: summarizeFrameIntervals([]),
      sampleLimitReached: false,
      longTasks: { supported: false, count: 0, totalMs: 0, maxMs: 0 },
      contextLost: 0,
      contextRestored: 0,
      pageErrors: 0,
      errorCounts: {
        runtime: 0,
        img: 0,
        script: 0,
        link: 0,
        video: 0,
        audio: 0,
        other: 0,
      },
      unhandledRejections: 0,
      hiddenTransitions: 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
    };
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      try {
        observer = new PerformanceObserver((list) => {
          recordLongTasks(list.getEntries());
        });
        observer.observe({ entryTypes: ["longtask"] });
        metrics.longTasks.supported = true;
      } catch {
        /* Safari may not expose this API. Keep supported=false. */
      }
    }
    frameId = requestAnimationFrame(frame);
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== window.parent ||
      event.origin !== window.location.origin ||
      event.data?.channel !== channel
    )
      return;
    if (event.data.type === "start") {
      runId = event.data.runId;
      start();
    }
    if (event.data.type === "stop" && event.data.runId === runId) finish();
    if (event.data.type === "ping") post("ready");
  });
  document.addEventListener("visibilitychange", () => {
    previous = null;
    if (active && document.hidden) metrics.hiddenTransitions++;
  });
  document.addEventListener(
    "webglcontextlost",
    () => {
      if (active) metrics.contextLost++;
    },
    true,
  );
  document.addEventListener(
    "webglcontextrestored",
    () => {
      if (active) metrics.contextRestored++;
    },
    true,
  );
  window.addEventListener(
    "error",
    (event) => {
      if (!active) return;
      metrics.pageErrors++;
      const counts = metrics.errorCounts;
      if (!counts) return;
      // Runtime errors target Window; resource errors target their element.
      // Only inspect the tag, never ErrorEvent details or resource attributes.
      if (event.target === event.currentTarget) {
        counts.runtime++;
        return;
      }
      const tag =
        event.target instanceof Element
          ? event.target.tagName.toLowerCase()
          : "";
      switch (tag) {
        case "img":
        case "script":
        case "link":
        case "video":
        case "audio": {
          counts[tag]++;
          break;
        }
        default: {
          counts.other++;
        }
      }
    },
    true,
  );
  window.addEventListener("unhandledrejection", () => {
    if (active) metrics.unhandledRejections++;
  });
  window.addEventListener("pagehide", () => {
    if (active) {
      post("interrupted");
      finish();
    }
  });
  post("ready");
}

export function installDevicePanel(token: string) {
  const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
  const startButton = document.querySelector<HTMLButtonElement>("#start")!;
  const stopButton = document.querySelector<HTMLButtonElement>("#stop")!;
  const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
  const status = document.querySelector<HTMLElement>("#status")!;
  const details = document.querySelector<HTMLDetailsElement>("details")!;
  let running = false;
  let reloads = 0;
  let startedAt = "";
  let metrics: DeviceMetrics | null = null;
  let runId = 0;
  let instanceId: string | null = null;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  const tellFrame = (type: string) =>
    frame.contentWindow?.postMessage(
      { channel, type, runId },
      window.location.origin,
    );
  window.addEventListener("message", (event) => {
    if (
      event.source !== frame.contentWindow ||
      event.origin !== window.location.origin ||
      event.data?.channel !== channel
    )
      return;
    if (event.data.type === "ready") {
      startButton.disabled = running;
      if (running && instanceId !== event.data.instanceId) {
        reloads++;
        status.textContent =
          "应用重新载入，本轮可能不完整。请结束并保存观察，再开始一轮。";
      } else if (!startedAt)
        status.textContent = "页面已就绪。点击开始，再操作下方图库。";
      instanceId = event.data.instanceId;
    }
    if (event.data.type === "interrupted" && event.data.runId === runId)
      reloads++;
    if (event.data.type === "result" && event.data.runId === runId) {
      clearTimeout(stopTimeout);
      metrics = event.data.metrics as DeviceMetrics;
      running = false;
      stopButton.disabled = true;
      startButton.disabled = false;
      saveButton.disabled = false;
      status.textContent = `已停止：${metrics.frames.count} 帧间隔；p95 ${metrics.frames.p95Ms}ms；超过50ms ${metrics.frames.over50Ms} 次。填写观察后保存。`;
      details.open = true;
    }
  });
  // Either document can finish loading first. Handshake without mistaking
  // repeated ready acknowledgements from the same document for a reload.
  frame.addEventListener("load", () => tellFrame("ping"));
  tellFrame("ping");
  startButton.addEventListener("click", () => {
    clearTimeout(stopTimeout);
    runId++;
    running = true;
    metrics = null;
    reloads = 0;
    startedAt = new Date().toISOString();
    startButton.disabled = true;
    stopButton.disabled = false;
    saveButton.disabled = true;
    details.open = false;
    status.textContent =
      "记录中：滚动 → 查看/缩放/切图 → 地图平移缩放 → 返回。";
    tellFrame("start");
  });
  stopButton.addEventListener("click", () => {
    tellFrame("stop");
    running = false;
    stopButton.disabled = true;
    status.textContent = "正在收集本轮结果…";
    const stoppingRun = runId;
    stopTimeout = setTimeout(() => {
      if (stoppingRun !== runId || metrics) return;
      startButton.disabled = false;
      saveButton.disabled = false;
      details.open = true;
      status.textContent =
        "应用未返回指标。本轮可保存为不完整记录，请填写卡顿/刷新观察。";
    }, 2000);
  });
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    const value = (id: string) =>
      document.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(`#${id}`)!.value;
    try {
      const response = await fetch("/__device-check/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": token,
        },
        body: JSON.stringify({
          version: 1,
          startedAt,
          metrics,
          reloads,
          userAgent: navigator.userAgent,
          model: value("model"),
          observation: value("observation"),
          notes: value("notes"),
        }),
      });
      if (!response.ok) throw new Error("report rejected");
      status.textContent = "已保存到 Mac。本轮完成，可再次开始。";
    } catch {
      status.textContent = "保存失败。确认 Mac 与手机仍连接，再点击保存。";
      saveButton.disabled = false;
    }
  });
}
