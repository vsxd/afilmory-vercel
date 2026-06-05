type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

type RegisterSW = (options?: {
  immediate?: boolean;
  onRegisterError?: (error: unknown) => void;
}) => UpdateServiceWorker;

type RegisterServiceWorkerOptions = {
  isProduction?: boolean;
  loadRegisterSW?: () => Promise<{ registerSW: RegisterSW }>;
};

export type RegisterServiceWorkerResult =
  | {
      reason: "registered";
      registered: true;
      updateServiceWorker: UpdateServiceWorker;
    }
  | {
      reason: "not-production" | "unsupported" | "register-error";
      registered: false;
    };

export async function registerProductionServiceWorker(
  options: RegisterServiceWorkerOptions = {},
): Promise<RegisterServiceWorkerResult> {
  const isProduction = options.isProduction ?? import.meta.env.PROD;
  if (!isProduction) {
    return { reason: "not-production", registered: false };
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { reason: "unsupported", registered: false };
  }

  try {
    const { registerSW } = await (options.loadRegisterSW?.() ??
      loadPwaRegister());
    const updateServiceWorker = registerSW({
      immediate: true,
      onRegisterError(error) {
        console.warn("[pwa] Failed to register service worker.", error);
      },
    });

    return {
      reason: "registered",
      registered: true,
      updateServiceWorker,
    };
  } catch (error) {
    console.warn("[pwa] Failed to load service worker registration.", error);
    return { reason: "register-error", registered: false };
  }
}

async function loadPwaRegister(): Promise<{ registerSW: RegisterSW }> {
  return (await import("virtual:pwa-register")) as {
    registerSW: RegisterSW;
  };
}
