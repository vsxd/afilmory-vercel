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
  /** 一次含捏合的手势全部手指抬起时触发（宿主可借此做微小缩放的回吸贴合） */
  onPinchEnd?: () => void;
}

/**
 * 统一走 Pointer Events 的画布输入控制器：鼠标 / 触摸 / 触控笔一套代码。
 *
 * - 单指 = 平移，双指 = 缩放（以 `Map<pointerId>` 追踪多指）。
 * - `setPointerCapture` 保证按下后即便指针移出画布/窗口也持续收到事件（取代旧的
 *   window mousemove/mouseup 动态监听）。
 * - 双击（含触摸双击）由指针 tap 合成（300ms + 50px），取代原生 `dblclick` 与
 *   手写的触摸双击两套逻辑。
 * - `wheel` 仍是独立监听（滚轮非指针事件）。
 * - 供照片查看器「下滑关闭」手势仲裁：当祖先手势夺走某指针的捕获时，本控制器会收到
 *   `lostpointercapture` 并清理该指针的在途平移/缩放状态（见 photo-viewer 的
 *   useDismissGesture）。
 */
export class WebGLInputController {
  // 活跃指针位置（clientX/clientY）。size===1 → 平移；size>=2 → 缩放。
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;
  // 本次手势（从第一指按下到全部抬起）是否发生过捏合：全部抬起时通知宿主，
  // 供其对微小缩放残留做回吸贴合。
  private gestureHadPinch = false;
  // 由指针 tap 合成双击：记录上一次单指 tap 的时间/位置。
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  // 缓存 canvas 的视口矩形：canvas 是固定全屏覆盖层，其 rect 仅在尺寸变化时改变。
  // 避免每个 wheel/pinch-move 事件都 getBoundingClientRect（在缩放途中若有 DOM
  // 更新弄脏布局，会触发强制同步重排）。手势开始时刷新、resize 时失效、懒计算兜底。
  private canvasRect: DOMRect | null = null;

  private readonly boundInvalidateCanvasRect = () => {
    this.canvasRect = null;
  };

  private readonly boundHandlePointerDown = (event: PointerEvent) =>
    this.handlePointerDown(event);
  private readonly boundHandlePointerMove = (event: PointerEvent) =>
    this.handlePointerMove(event);
  private readonly boundHandlePointerUp = (event: PointerEvent) =>
    this.handlePointerUp(event);
  private readonly boundForgetPointer = (event: PointerEvent) =>
    this.forgetPointer(event);
  private readonly boundHandleWheel = (event: WheelEvent) =>
    this.handleWheel(event);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly config: Required<WebGLImageViewerProps>,
    private readonly host: WebGLInputControllerHost,
  ) {}

  connect(): void {
    // pointerdown/move 需 preventDefault（配合 canvas 的 touch-action:none）→ 非被动。
    this.canvas.addEventListener("pointerdown", this.boundHandlePointerDown, {
      passive: false,
    });
    this.canvas.addEventListener("pointermove", this.boundHandlePointerMove, {
      passive: false,
    });
    this.canvas.addEventListener("pointerup", this.boundHandlePointerUp);
    this.canvas.addEventListener("pointercancel", this.boundForgetPointer);
    // 捕获被祖先手势夺走时清理在途状态（下滑关闭仲裁的复位钩子）。
    this.canvas.addEventListener("lostpointercapture", this.boundForgetPointer);
    this.canvas.addEventListener("wheel", this.boundHandleWheel);
    window.addEventListener("resize", this.boundInvalidateCanvasRect);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.boundHandlePointerDown);
    this.canvas.removeEventListener("pointermove", this.boundHandlePointerMove);
    this.canvas.removeEventListener("pointerup", this.boundHandlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundForgetPointer);
    this.canvas.removeEventListener(
      "lostpointercapture",
      this.boundForgetPointer,
    );
    this.canvas.removeEventListener("wheel", this.boundHandleWheel);
    window.removeEventListener("resize", this.boundInvalidateCanvasRect);
  }

  private stopAnimationIfNeeded(): boolean {
    if (!this.host.isAnimating()) {
      return false;
    }

    this.host.stopAnimation();
    return true;
  }

  private handlePointerDown(event: PointerEvent): void {
    // 鼠标仅认主键（收紧旧路径「右键也平移」的潜在问题）。
    if (event.pointerType === "mouse" && event.button !== 0) return;

    // 停止进行中的动画，但不要 early-return——否则中断动画的那一次按下会被吞掉，
    // 用户必须再按一次才能开始拖动。
    this.stopAnimationIfNeeded();

    // 手势开始时刷新缓存的 rect，pinch/双击/wheel 途中即可复用、不再逐帧读布局。
    this.canvasRect = this.canvas.getBoundingClientRect();

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // 捕获该指针：即便移出画布/窗口也持续收到 move/up（取代 window 监听）。
    this.canvas.setPointerCapture?.(event.pointerId);

    if (this.pointers.size === 2 && !this.config.pinch.disabled) {
      const [a, b] = [...this.pointers.values()];
      this.lastPinchDistance = pointerDistance(a, b);
      this.gestureHadPinch = true;
    }

    // 杀掉图片拖影/文本选择等默认行为（旧触摸路径即如此）。
    event.preventDefault();
  }

  private handlePointerMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return; // hover / 未追踪的指针

    event.preventDefault();

    if (this.pointers.size === 1) {
      if (this.config.panning.disabled) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        return;
      }
      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.host.panBy(deltaX, deltaY);
      return;
    }

    // 两指及以上 → 缩放。先更新本指针存位，再据「两指均为当前位」计算，
    // 从而 pan↔pinch 互转无跳变：第二指按下即种基线（不跳），抬指后存活指的
    // 存位即真实当前位（不跳）。
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (this.config.pinch.disabled) return;

    const [a, b] = [...this.pointers.values()];
    const distance = pointerDistance(a, b);
    if (this.lastPinchDistance > 0) {
      const scaleFactor = distance / this.lastPinchDistance;
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      const { x, y } = this.getCanvasPoint(centerX, centerY);
      this.host.zoomAt(x, y, scaleFactor);
    }
    this.lastPinchDistance = distance;
  }

  private handlePointerUp(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;

    const wasPinch = this.pointers.size >= 2;
    this.pointers.delete(event.pointerId);

    // 仅「非缩放收尾且所有指针都抬起」的干净单指抬手才参与双击合成：
    // 300ms 内、位移 <50px 的连续两次 tap 触发一次双击动作。
    if (
      !wasPinch &&
      this.pointers.size === 0 &&
      !this.config.doubleClick.disabled
    ) {
      const now = Date.now();
      if (
        now - this.lastTapTime < 300 &&
        Math.abs(event.clientX - this.lastTapX) < 50 &&
        Math.abs(event.clientY - this.lastTapY) < 50
      ) {
        const { x, y } = this.getCanvasPoint(event.clientX, event.clientY);
        this.host.performDoubleClickAction(x, y);
        this.lastTapTime = 0; // 重置：需再两次全新 tap 才再触发
      } else {
        this.lastTapTime = now;
        this.lastTapX = event.clientX;
        this.lastTapY = event.clientY;
      }
    }

    if (this.pointers.size < 2) {
      this.lastPinchDistance = 0;
    }
    this.notifyPinchEndIfGestureFinished();
  }

  // pointercancel 与 lostpointercapture 共用：移除该指针、清缩放基线，但不判双击
  // （捕获丢失/取消不是一次完成的 tap）。幂等——与 pointerup 的删除竞态时安全 no-op。
  private forgetPointer(event: PointerEvent): void {
    if (!this.pointers.delete(event.pointerId)) return;
    if (this.pointers.size < 2) {
      this.lastPinchDistance = 0;
    }
    this.notifyPinchEndIfGestureFinished();
  }

  private notifyPinchEndIfGestureFinished(): void {
    if (this.pointers.size > 0 || !this.gestureHadPinch) return;
    this.gestureHadPinch = false;
    this.host.onPinchEnd?.();
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

function pointerDistance(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}
