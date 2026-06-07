import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { MasonryRef } from "./Masonic";
import { Masonry } from "./Masonic";

vi.stubGlobal(
  "ResizeObserver",
  vi.fn(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  })),
);

vi.mock("@afilmory/ui", () => ({
  useScrollViewElement: () => null,
}));

const masonicMocks = vi.hoisted(() => ({
  positioner: {
    columnCount: 2,
    columnWidth: 100,
    get: vi.fn(() => ({
      height: 80,
      left: 10,
      top: 20,
    })),
  },
}));

vi.mock("masonic", async () => {
  const React = await import("react");
  type MockMasonryOptions = {
    containerRef?: {
      current: HTMLElement | null;
    };
  };

  return {
    createResizeObserver: () => ({ disconnect: vi.fn() }),
    useMasonry: ({ containerRef }: MockMasonryOptions) => (
      <div
        data-testid="masonry"
        ref={(node) => {
          if (containerRef) {
            containerRef.current = node;
          }
        }}
      />
    ),
    usePositioner: () => masonicMocks.positioner,
    useScrollToIndex: () => vi.fn(),
  };
});

describe("Masonry wrapper", () => {
  it("renders through masonic and exposes layout metrics", () => {
    let capturedRef: React.RefObject<MasonryRef | null> | null = null;

    const Probe = () => {
      const ref = useRef<MasonryRef>(null);
      capturedRef = ref;

      return (
        <Masonry
          ref={ref}
          items={[{ id: "a" }]}
          columnWidth={100}
          columnGutter={4}
          rowGutter={6}
          render={() => null}
        />
      );
    };

    render(<Probe />);

    expect(screen.getByTestId("masonry")).toBeTruthy();
    expect(capturedRef?.current?.getItemRect(0)).toMatchObject({
      height: 80,
      width: 100,
    });
  });
});
