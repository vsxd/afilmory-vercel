import type { PropsWithChildren } from "react";

import type { AppRuntime } from "./app-runtime";
import { AppRuntimeContext } from "./app-runtime";

export function AfilmoryRuntimeProvider({
  children,
  runtime,
}: PropsWithChildren<{ runtime: AppRuntime }>) {
  return <AppRuntimeContext value={runtime}>{children}</AppRuntimeContext>;
}
