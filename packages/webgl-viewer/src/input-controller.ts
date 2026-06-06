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
    event.preventDefault();
    if (this.config.wheel.wheelDisabled) return;

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

    if (this.stopAnimationIfNeeded()) {
      return;
    }

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
    const rect = this.canvas.getBoundingClientRect();
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
