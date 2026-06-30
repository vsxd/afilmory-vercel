import { describe, expect, it } from "vitest";

import { clone } from "./clone.js";

describe("clone", () => {
  it("returns primitives unchanged", () => {
    expect(clone(42)).toBe(42);
    expect(clone("hello")).toBe("hello");
    expect(clone(null)).toBe(null);
    expect(clone(true)).toBe(true);
  });

  it("deep-clones nested objects and arrays with fresh references", () => {
    const source = { a: 1, nested: { b: [1, 2, { c: 3 }] } };
    const result = clone(source);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(result.nested).not.toBe(source.nested);
    expect(result.nested.b).not.toBe(source.nested.b);
    expect(result.nested.b[2]).not.toBe(source.nested.b[2]);
  });

  it("preserves Date, Map, and Set instances by value", () => {
    const source = {
      date: new Date("2026-06-06T00:00:00.000Z"),
      map: new Map([["k", "v"]]),
      set: new Set([1, 2, 3]),
    };
    const result = clone(source);

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.getTime()).toBe(source.date.getTime());
    expect(result.date).not.toBe(source.date);

    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get("k")).toBe("v");

    expect(result.set).toBeInstanceOf(Set);
    expect([...result.set]).toEqual([1, 2, 3]);
  });

  it("falls back to the manual deep clone for values structuredClone rejects (functions)", () => {
    // structuredClone and node:v8 serialize both throw on functions, forcing
    // the manualClone path that is otherwise never exercised.
    const fn = () => 1;
    const source = { fn, nested: { x: 1 } };
    const result = clone(source);

    expect(result).not.toBe(source);
    expect(result.fn).toBe(fn); // functions are preserved by reference
    expect(result.nested).not.toBe(source.nested);
    expect(result.nested.x).toBe(1);
  });

  it("handles circular references inside the manual fallback path", () => {
    const source: { fn: () => number; self?: unknown } = { fn: () => 1 };
    source.self = source;

    const result = clone(source) as typeof source;

    expect(result.self).toBe(result); // cycle re-pointed at the clone, not the source
    expect(result.fn).toBe(source.fn);
  });
});
