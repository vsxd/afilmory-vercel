import { describe, expect, it } from "vitest";

import { resolveCommandKeyboardIntent } from "./keyboard";

describe("command-palette keyboard helper", () => {
  it("moves selection within result bounds", () => {
    expect(
      resolveCommandKeyboardIntent("ArrowDown", {
        selectedIndex: 0,
        resultCount: 2,
      }),
    ).toEqual({ type: "move", selectedIndex: 1 });

    expect(
      resolveCommandKeyboardIntent("ArrowDown", {
        selectedIndex: 1,
        resultCount: 2,
      }),
    ).toEqual({ type: "move", selectedIndex: 1 });

    expect(
      resolveCommandKeyboardIntent("ArrowUp", {
        selectedIndex: 0,
        resultCount: 2,
      }),
    ).toEqual({ type: "move", selectedIndex: 0 });
  });

  it("returns execute intent for Enter and ignores empty results", () => {
    expect(
      resolveCommandKeyboardIntent("Enter", {
        selectedIndex: 3,
        resultCount: 5,
      }),
    ).toEqual({ type: "execute", selectedIndex: 3 });

    expect(
      resolveCommandKeyboardIntent("Enter", {
        selectedIndex: 0,
        resultCount: 0,
      }),
    ).toEqual({ type: "none" });
  });
});
