import type { WebGLImageViewerProps } from "./interface";

export interface WebGLInputControllerHost {
  isAnimating: () => boolean;
  stopAnimation: () => void;
  panBy: (deltaX: number, deltaY: number) => void;
  zoomAt: (
    x: number,
    y: number,
    scaleFactor: number,
    animated?: boolean,
  ) => void;
  performDoubleClickAction: (x: number, y: number) => void;
}

export class WebGLInputController {
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private lastTouchDistance = 0;
  private lastDoubleClickTime = 0;
  private lastTouchTime = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;
  // 缓存 canvas 的视口矩形：canvas 是固定全屏覆盖层，其 rect 仅在尺寸变化时改变。
  // 避免每个 wheel/pinch-move 事件都 getBoundingClientRect（在缩放途中若有 DOM
  // 更新弄脏布局，会触发强制同步重排）。手势开始时刷新、resize 时失效、懒计算兜底。
  private canvasRect: DOMRect | null = null;

  private readonly boundInvalidateCanvasRect = () => {
    this.canvasRect = null;
  };

  private readonly boundHandleMouseDown = (event: MouseEvent) =>
    this.handleMouseDown(event);
  private readonly boundHandleMouseMove = (event: MouseEvent) =>
    this.handleMouseMove(event);
  private readonly boundHandleMouseUp = () => this.handleMouseUp();
  private readonly boundHandleWheel = (event: WheelEvent) =>
    this.handleWheel(event);
  private readonly boundHandleDoubleClick = (event: MouseEvent) =>
    this.handleDoubleClick(event);
  private readonly boundHandleTouchStart = (event: TouchEvent) =>
    this.handleTouchStart(event);
  private readonly boundHandleTouchMove = (event: TouchEvent) =>
    this.handleTouchMove(event);
  private readonly boundHandleTouchEnd = () => this.handleTouchEnd();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: Required<WebGLImageViewerProps>,
    private readonly host: WebGLInputControllerHost,
  ) {}

  connect(): void {
    this.canvas.addEventListener("mousedown", this.boundHandleMouseDown);
    this.canvas.addEventListener("wheel", this.boundHandleWheel);
    this.canvas.addEventListener("dblclick", this.boundHandleDoubleClick);
    this.canvas.addEventListener("touchstart", this.boundHandleTouchStart);
    this.canvas.addEventListener("touchmove", this.boundHandleTouchMove);
    this.canvas.addEventListener("touchend", this.boundHandleTouchEnd);
    window.addEventListener("resize", this.boundInvalidateCanvasRect);
  }

  dispose(): void {
    window.removeEventListener("mousemove", this.boundHandleMouseMove);
    window.removeEventListener("mouseup", this.boundHandleMouseUp);
    this.canvas.removeEventListener("mousedown", this.boundHandleMouseDown);
    this.canvas.removeEventListener("wheel", this.boundHandleWheel);
    this.canvas.removeEventListener("dblclick", this.boundHandleDoubleClick);
    this.canvas.removeEventListener("touchstart", this.boundHandleTouchStart);
    this.canvas.removeEventListener("touchmove", this.boundHandleTouchMove);
    this.canvas.removeEventListener("touchend", this.boundHandleTouchEnd);
    window.removeEventListener("resize", this.boundInvalidateCanvasRect);
  }

  private stopAnimationIfNeeded(): boolean {
    if (!this.host.isAnimating()) {
      return false;
    }

    this.host.stopAnimation();
    return true;
  }

  private handleMouseDown(event: MouseEvent): void {
    this.stopAnimationIfNeeded();
    if (this.config.panning.disabled) return;

    // 手势开始时刷新缓存的 rect，确保后续 wheel/double-click 映射准确。
    this.canvasRect = this.canvas.getBoundingClientRect();
    this.isDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    window.addEventListener("mousemove", this.boundHandleMouseMove);
    window.addEventListener("mouseup", this.boundHandleMouseUp);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isDragging || this.config.panning.disabled) return;

    const deltaX = event.clientX - this.lastMouseX;
    const deltaY = event.clientY - this.lastMouseY;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    this.host.panBy(deltaX, deltaY);
  }

  private handleMouseUp(): void {
    this.isDragging = false;
    window.removeEventListener("mousemove", this.boundHandleMouseMove);
    window.removeEventListener("mouseup", this.boundHandleMouseUp);
  }

  private handleWheel(event: WheelEvent): void {
    // 先判断是否禁用滚轮缩放：禁用时不应吞掉页面滚动。
    if (this.config.wheel.wheelDisabled) return;
    event.preventDefault();

    this.stopAnimationIfNeeded();
    const { x, y } = this.getCanvasPoint(event.clientX, event.clientY);
    const scaleFactor =
      event.deltaY > 0
        ? 1 - this.config.wheel.step
        : 1 + this.config.wheel.step;
    this.host.zoomAt(x, y, scaleFactor);
  }

  private handleDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    if (this.config.doubleClick.disabled) return;

    const now = Date.now();
    if (now - this.lastDoubleClickTime < 300) return;
    this.lastDoubleClickTime = now;

    const { x, y } = this.getCanvasPoint(event.clientX, event.clientY);
    this.host.performDoubleClickAction(x, y);
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();

    // 停止进行中的动画，但不要 early-return——否则中断动画的那一次手指按下会被
    // 吞掉，用户必须再点一次才能开始拖动（鼠标路径也是停动画后继续）。
    this.stopAnimationIfNeeded();

    // 手势开始时刷新缓存的 rect，pinch 途中的 touchmove 即可复用、不再逐帧读布局。
    this.canvasRect = this.canvas.getBoundingClientRect();

    if (event.touches.length === 1 && !this.config.panning.disabled) {
      const touch = event.touches[0];
      const now = Date.now();

      if (
        !this.config.doubleClick.disabled &&
        now - this.lastTouchTime < 300 &&
        Math.abs(touch.clientX - this.lastTouchX) < 50 &&
        Math.abs(touch.clientY - this.lastTouchY) < 50
      ) {
        this.handleTouchDoubleTap(touch.clientX, touch.clientY);
        this.lastTouchTime = 0;
        return;
      }

      this.isDragging = true;
      this.lastMouseX = touch.clientX;
      this.lastMouseY = touch.clientY;
      this.lastTouchTime = now;
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      return;
    }

    if (event.touches.length === 2 && !this.config.pinch.disabled) {
      this.isDragging = false;
      this.lastTouchDistance = getTouchDistance(
        event.touches[0],
        event.touches[1],
      );
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (
      event.touches.length === 1 &&
      this.isDragging &&
      !this.config.panning.disabled
    ) {
      const deltaX = event.touches[0].clientX - this.lastMouseX;
      const deltaY = event.touches[0].clientY - this.lastMouseY;
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
      this.host.panBy(deltaX, deltaY);
      return;
    }

    if (event.touches.length === 2 && !this.config.pinch.disabled) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const distance = getTouchDistance(touch1, touch2);

      if (this.lastTouchDistance > 0) {
        const scaleFactor = distance / this.lastTouchDistance;
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        const { x, y } = this.getCanvasPoint(centerX, centerY);
        this.host.zoomAt(x, y, scaleFactor);
      }

      this.lastTouchDistance = distance;
    }
  }

  private handleTouchEnd(): void {
    this.isDragging = false;
    this.lastTouchDistance = 0;
  }

  private handleTouchDoubleTap(clientX: number, clientY: number): void {
    if (this.config.doubleClick.disabled) return;

    const { x, y } = this.getCanvasPoint(clientX, clientY);
    this.host.performDoubleClickAction(x, y);
  }

  private getCanvasPoint(
    clientX: number,
    clientY: number,
  ): {
    x: number;
    y: number;
  } {
    const rect =
      this.canvasRect ??
      (this.canvasRect = this.canvas.getBoundingClientRect());
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }
}

function getTouchDistance(first: Touch, second: Touch): number {
  return Math.sqrt(
    Math.pow(second.clientX - first.clientX, 2) +
      Math.pow(second.clientY - first.clientY, 2),
  );
}
