import { transferableAbortController } from "node:util";

import { createMemoryRouter } from "react-router";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { NavigationController } from "../controller";

// jsdom's AbortSignal cannot be passed to Node's built-in Request used by Router.
const originalAbortController = globalThis.AbortController;
beforeAll(() =>
  vi.stubGlobal(
    "AbortController",
    class {
      constructor() {
        return transferableAbortController();
      }
    },
  ),
);
afterAll(() => vi.stubGlobal("AbortController", originalAbortController));
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
});

export function createTestNavigation(url = "/") {
  const router = createMemoryRouter([{ path: "*" }], { initialEntries: [url] });
  const navigation = new NavigationController();
  navigation.bind(router);
  cleanups.push(() => {
    navigation.dispose();
    router.dispose();
  });
  return { navigation, router };
}
