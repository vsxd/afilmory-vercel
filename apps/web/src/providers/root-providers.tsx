import { ModalProvider, Spring, Toaster } from "@afilmory/ui";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Provider } from "jotai";
import { LazyMotion, MotionConfig } from "motion/react";
import type { FC, PropsWithChildren } from "react";

import type { AppRuntime } from "~/runtime/app-runtime";
import { AfilmoryRuntimeProvider } from "~/runtime/app-runtime-provider";

import { ContextMenuProvider } from "./context-menu-provider";
import { EventProvider } from "./event-provider";
import { I18nProvider } from "./i18n-provider";
import { StableRouterProvider } from "./stable-router-provider";

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
          <ModalProvider>
            <EventProvider />
            <StableRouterProvider />

            <ContextMenuProvider />
            <I18nProvider>{children}</I18nProvider>
          </ModalProvider>
        </Provider>
      </AfilmoryRuntimeProvider>
    </MotionConfig>
    <Toaster />
    <SpeedInsights />
  </LazyMotion>
);
