import { Toaster } from '@afilmory/ui'
import { Spring } from '@afilmory/utils'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Provider } from 'jotai'
import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import type { FC, PropsWithChildren } from 'react'

import { jotaiStore } from '~/lib/jotai'

import { ContextMenuProvider } from './context-menu-provider'
import { EventProvider } from './event-provider'
import { I18nProvider } from './i18n-provider'
import { StableRouterProvider } from './stable-router-provider'

export const RootProviders: FC<PropsWithChildren> = ({ children }) => (
  <LazyMotion features={domMax} strict key="framer">
    <MotionConfig transition={Spring.presets.smooth}>
      <Provider store={jotaiStore}>
        <EventProvider />
        <StableRouterProvider />

        <ContextMenuProvider />
        <I18nProvider>{children}</I18nProvider>
      </Provider>
    </MotionConfig>
    <Toaster />
    <SpeedInsights />
  </LazyMotion>
)
