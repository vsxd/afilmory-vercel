import type { DebugInfo, WebGLImageViewerProps } from "./interface";
import { WebGLImageViewerEngine } from "./WebGLImageViewerEngine";

/**
 * Owns a single canvas/context/worker across active carousel slides. A short idle
 * grace period spans React unmount/mount gaps; closing the viewer frees resources.
 * Construction is DOM-free so app runtimes can also be created during SSR/tests.
 */
export class WebGLViewerSession {
  private canvas: HTMLCanvasElement | null = null;
  private engine: WebGLImageViewerEngine | null = null;
  private lease: symbol | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly idleTimeoutMs = 750) {}

  attach(
    host: HTMLElement,
    config: Required<WebGLImageViewerProps>,
    debugRef?: React.RefObject<(debugInfo: DebugInfo) => void>,
  ): { engine: WebGLImageViewerEngine; release: () => void } {
    if (this.disposed) throw new Error("Viewer session is disposed");
    this.cancelIdleRelease();
    if (this.engine && !this.engine.isReusable()) this.destroyEngine();
    const lease = Symbol();
    this.lease = lease;
    try {
      if (!this.canvas) {
        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("aria-hidden", "true");
        Object.assign(this.canvas.style, {
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
          border: "none",
          outline: "none",
          margin: "0",
          padding: "0",
        });
      }
      this.canvas.className = config.className;
      host.append(this.canvas);
      if (this.engine) {
        this.engine.updateConfig(config, debugRef);
        this.engine.resume();
      } else {
        this.engine = new WebGLImageViewerEngine(this.canvas, config, debugRef);
      }
    } catch (error) {
      this.destroyEngine();
      throw error;
    }
    return {
      engine: this.engine,
      release: () => {
        if (this.lease !== lease) return;
        this.lease = null;
        this.engine?.suspend();
        this.canvas?.remove();
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null;
          if (this.lease === null) this.destroyEngine();
        }, this.idleTimeoutMs);
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  /** Release resources without ending the owner lifetime (React effect replay). */
  reset(): void {
    this.cancelIdleRelease();
    this.destroyEngine();
  }

  private cancelIdleRelease(): void {
    if (this.idleTimer === null) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private destroyEngine(): void {
    this.engine?.destroy();
    this.engine = null;
    this.canvas?.remove();
    this.canvas = null;
    this.lease = null;
  }
}
