import { Spring, Toaster } from "@afilmory/ui";
import { Provider } from "jotai";
import { LazyMotion, MotionConfig } from "motion/react";
import type { FC, PropsWithChildren } from "react";
import { lazy, Suspense } from "react";

import type { AppRuntime } from "~/runtime/app-runtime";
import { AfilmoryRuntimeProvider } from "~/runtime/app-runtime-provider";

import { ContextMenuProvider } from "./context-menu-provider";
import { EventProvider } from "./event-provider";
import { I18nProvider } from "./i18n-provider";

const speedInsightsEnabled =
  import.meta.env.PROD && import.meta.env.VITE_ENABLE_SPEED_INSIGHTS === "true";
const SpeedInsights = lazy(() =>
  import("@vercel/speed-insights/react").then((module) => ({
    default: module.SpeedInsights,
  })),
);

export const RootProviders: FC<PropsWithChildren<{ runtime: AppRuntime }>> = ({
  children,
  runtime,
}) => (
  <LazyMotion
    features={() => import("motion/react").then((m) => m.domMax)}
    strict
    key="framer"
  >
    <MotionConfig transition={Spring.presets.smooth} reducedMotion="user">
      <AfilmoryRuntimeProvider runtime={runtime}>
        <Provider store={runtime.store}>
          <EventProvider />

          <ContextMenuProvider />
          <I18nProvider>{children}</I18nProvider>
        </Provider>
      </AfilmoryRuntimeProvider>
    </MotionConfig>
    <Toaster />
    {speedInsightsEnabled && (
      <Suspense fallback={null}>
        <SpeedInsights />
      </Suspense>
    )}
  </LazyMotion>
);
