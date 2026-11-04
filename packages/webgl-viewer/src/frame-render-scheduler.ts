/** One frame boundary for input, animation and asynchronously arriving textures. */
export class FrameRenderScheduler {
  private frameId: number | null = null;
  private flushing = false;
  private generation = 0;

  constructor(private readonly onFrame: (time: number) => boolean) {}

  request(): void {
    if (this.frameId !== null || this.flushing) return;
    const { generation } = this;
    this.frameId = requestAnimationFrame((time) => {
      if (generation !== this.generation) return;
      this.frameId = null;
      this.run(time);
    });
  }

  /** A first available image must not wait behind the normal rendering queue. */
  flush(): void {
    if (this.flushing) return;
    this.cancel();
    this.run(performance.now());
  }

  cancel(): void {
    this.generation++;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private run(time: number): void {
    this.flushing = true;
    let continueRendering = false;
    try {
      continueRendering = this.onFrame(time);
    } finally {
      this.flushing = false;
    }
    if (continueRendering) this.request();
  }
}
