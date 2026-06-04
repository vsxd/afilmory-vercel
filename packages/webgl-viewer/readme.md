# WebGL Image Viewer

`@afilmory/webgl-viewer` 是 Afilmory Web 应用使用的 React 19 WebGL 图片查看器。它负责大图渲染、缩放、平移、分块纹理加载、调试信息和加载状态回调。

## Package Status

本包在当前仓库中作为 pnpm workspace 包使用：

```bash
pnpm --filter @afilmory/webgl-viewer build
pnpm --filter @afilmory/webgl-viewer type-check
pnpm --filter @afilmory/webgl-viewer test
```

`package.json` 的入口是 `src/index.ts`，构建由 `vite.config.ts` 输出 ESM library 到 `dist/index.js`，并通过 `unplugin-dts` 输出类型声明。

## Source Layout

```text
src/
├── DebugInfo.tsx              # debug overlay
├── ImageViewerEngineBase.ts   # engine base class
├── WebGLImageViewer.tsx       # React component wrapper
├── WebGLImageViewerEngine.ts  # WebGL engine and interactions
├── constants.ts               # default interaction configs
├── enum.ts                    # LoadingState
├── index.ts                   # public exports
├── interface.ts               # public prop/ref/debug types
├── shaders.ts                 # shader helpers
└── texture.worker.js          # image/tile worker
```

## Quick Start

```tsx
import { WebGLImageViewer } from "@afilmory/webgl-viewer";

export function Viewer() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <WebGLImageViewer
        src="/path/to/image.jpg"
        width={4000}
        height={3000}
        onZoomChange={(scale, relativeScale) => {
          console.log({ scale, relativeScale });
        }}
        onError={(error) => {
          console.error(error);
        }}
      />
    </div>
  );
}
```

The component also accepts normal `div` attributes, except `className` is applied to the internal canvas.

## Props

### Basic props

| Prop            | Type           | Default  | Description                                      |
| --------------- | -------------- | -------- | ------------------------------------------------ |
| `src`           | `string`       | required | Image URL or object URL                          |
| `sourceBlob`    | `Blob \| null` | `null`   | Optional blob passed to the texture worker       |
| `className`     | `string`       | `""`     | CSS class applied to the canvas                  |
| `width`         | `number`       | `0`      | Optional known image width for load optimization |
| `height`        | `number`       | `0`      | Optional known image height                      |
| `initialScale`  | `number`       | `1`      | Initial multiplier on fit-to-screen scale        |
| `minScale`      | `number`       | `0.1`    | Minimum scale                                    |
| `maxScale`      | `number`       | `10`     | User max scale before engine constraints         |
| `limitToBounds` | `boolean`      | `true`   | Keep image within viewport bounds                |
| `centerOnInit`  | `boolean`      | `true`   | Center image after initial load                  |
| `smooth`        | `boolean`      | `true`   | Enable smooth animation behavior                 |
| `debug`         | `boolean`      | `false`  | Show debug overlay                               |

### Interaction config

```ts
type WheelConfig = {
  step: number; // default 0.1
  wheelDisabled?: boolean;
  touchPadDisabled?: boolean;
};

type PinchConfig = {
  step: number; // default 0.5
  disabled?: boolean;
};

type DoubleClickConfig = {
  step: number; // default 2; toggle mode is a fit-to-screen multiplier, zoom mode is a zoom factor
  disabled?: boolean;
  mode: "toggle" | "zoom";
  animationTime: number; // default 200ms
};

type PanningConfig = {
  disabled?: boolean;
  velocityDisabled?: boolean; // default true
};
```

### Animation config

```ts
type AlignmentAnimationConfig = {
  sizeX: number;
  sizeY: number;
  velocityAlignmentTime: number; // default 0.2
};

type VelocityAnimationConfig = {
  sensitivity: number; // default 1
  animationTime: number; // default 0.2
};
```

### Callbacks

```ts
onZoomChange?: (originalScale: number, relativeScale: number) => void;
onImageCopied?: () => void;
onLoadingStateChange?: (
  isLoading: boolean,
  state?: LoadingState,
  quality?: "high" | "medium" | "low" | "unknown",
) => void;
onImagePainted?: () => void;
onError?: (error: unknown) => void;
```

`onImagePainted` fires after the engine paints the high-resolution image. The web app uses it to coordinate progressive image transitions.

## Ref API

```tsx
import type { WebGLImageViewerRef } from "@afilmory/webgl-viewer";

const viewerRef = useRef<WebGLImageViewerRef>(null);

viewerRef.current?.zoomIn(true);
viewerRef.current?.zoomOut(false);
viewerRef.current?.resetView();
const scale = viewerRef.current?.getScale();
```

Available methods:

| Method      | Description                         |
| ----------- | ----------------------------------- |
| `zoomIn`    | Zoom around the viewport center     |
| `zoomOut`   | Zoom out around the viewport center |
| `resetView` | Reset to fit-to-screen baseline     |
| `getScale`  | Return the current absolute scale   |

## Loading State

`LoadingState` is exported from `enum.ts` and can be used with `onLoadingStateChange`:

```ts
import { LoadingState } from "@afilmory/webgl-viewer";
```

The callback also reports quality as `"high"`, `"medium"`, `"low"`, or `"unknown"`.

## Debug Overlay

Set `debug={true}` to display runtime information:

- scale and relative scale
- translation
- canvas and image dimensions
- LOD and quality state
- memory estimates
- tile cache, visible tiles, pending requests
- max texture size

The debug overlay also exposes a tile outline toggle.

## Implementation Notes

- `WebGLImageViewer.tsx` owns React lifecycle and engine creation/destruction.
- `WebGLImageViewerEngine.ts` owns WebGL state, pointer/touch/wheel/double-click handling, tiling, animations, and clipboard copy.
- `texture.worker.js` loads image data and creates tile bitmaps off the main thread when possible.
- The component calls `onError` for initialization and image loading failures so the app can fall back gracefully.

## Development Checklist

When changing viewer behavior:

```bash
pnpm --filter @afilmory/webgl-viewer test
pnpm --filter @afilmory/webgl-viewer type-check
pnpm --filter @afilmory/webgl-viewer build
```

If the change affects the app integration, also run the relevant `@afilmory/web` photo-viewer tests.

## License

[MIT License](LICENSE)
