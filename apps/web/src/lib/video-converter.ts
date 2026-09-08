import { debugLog } from "./debug-log";
import { isSafari } from "./device-viewport";
// 检测浏览器是否原生支持 MOV 格式
function isBrowserSupportMov(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  // 创建一个临时的 video 元素来测试格式支持
  const video = document.createElement("video");

  // 检测是否支持 MOV 容器格式
  const canPlayMov = video.canPlayType("video/quicktime");

  // Safari 通常原生支持 MOV
  if (isSafari) {
    return true;
  }

  // 对于其他浏览器，只有当 canPlayType 明确返回支持时才认为支持
  // 'probably' 或 'maybe' 表示支持，空字符串表示不支持
  return canPlayMov === "probably" || canPlayMov === "maybe";
}

// 检测是否需要转换 mov 文件
export function needsVideoConversion(url: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const lowerUrl = url.toLowerCase();
  const isMovFile = lowerUrl.includes(".mov") || lowerUrl.endsWith(".mov");

  // 如果不是 MOV 文件，不需要转换
  if (!isMovFile) {
    return false;
  }

  // 如果浏览器原生支持 MOV，不需要转换
  if (isBrowserSupportMov()) {
    debugLog("Browser natively supports MOV format, skipping conversion");
    return false;
  }

  // 浏览器不支持 MOV，需要转换
  debugLog("Browser does not support MOV format, conversion needed");
  return true;
}

/**
 * 把 MOV 原始字节重贴为 video/mp4 的 blob URL——不转封装。
 * MOV 与 MP4 同属 ISO-BMFF 容器家族，Chromium 的解复用器本就认得
 * QuickTime 结构，拦住播放的只是 MIME 嗅探，换标签即可。
 */
export async function relabelMovAsMp4(
  videoUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await fetch(videoUrl, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const blob = new Blob([buffer], { type: "video/mp4" });
  debugLog(`MOV relabeled as MP4: ${Math.round(blob.size / 1024)}KB`);

  return blob;
}
