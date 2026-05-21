import type { Transition } from "motion/react";
import { animateValue } from "motion/react";

const spring: Transition = {
  type: "spring",
  stiffness: 1000,
  damping: 250,
};

const getDefaultScrollerElement = () => {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
};

export const springScrollTo = (
  value: number,
  scrollerElement?: HTMLElement | null,
  axis: "x" | "y" = "y",
) => {
  const defaultScrollerElement = getDefaultScrollerElement();
  const targetScrollerElement = scrollerElement ?? defaultScrollerElement;

  if (!targetScrollerElement || typeof requestAnimationFrame === "undefined") {
    return null;
  }

  const currentValue =
    axis === "x"
      ? targetScrollerElement.scrollLeft
      : targetScrollerElement.scrollTop;
  const eventTarget =
    targetScrollerElement === defaultScrollerElement &&
    typeof window !== "undefined"
      ? window
      : targetScrollerElement;

  let isStop = false;
  const stopSpringScrollHandler = () => {
    isStop = true;
    animation.stop();
  };

  const animation = animateValue({
    keyframes: [currentValue + 1, value],
    autoplay: true,
    ...spring,
    onPlay() {
      eventTarget.addEventListener("wheel", stopSpringScrollHandler, {
        capture: true,
      });
      eventTarget.addEventListener("touchmove", stopSpringScrollHandler);
    },

    onUpdate(latest) {
      if (latest <= 0) {
        animation.stop();
        return;
      }

      if (isStop) {
        return;
      }

      requestAnimationFrame(() => {
        if (axis === "x") {
          targetScrollerElement.scrollLeft = latest;
        } else {
          targetScrollerElement.scrollTop = latest;
        }
      });
    },
  });

  animation.then(() => {
    eventTarget.removeEventListener("wheel", stopSpringScrollHandler, {
      capture: true,
    });
    eventTarget.removeEventListener("touchmove", stopSpringScrollHandler);
  });

  return animation;
};

export const springScrollToElement = (
  element: HTMLElement,
  delta = 40,

  scrollerElement?: HTMLElement | null,
) => {
  const y = calculateElementTop(element);

  const to = y + delta;

  return springScrollTo(to, scrollerElement ?? getDefaultScrollerElement());
};

const calculateElementTop = (el: HTMLElement) => {
  let top = 0;
  let currentElement: HTMLElement | null = el;
  while (currentElement) {
    top += currentElement.offsetTop;
    currentElement = currentElement.offsetParent as HTMLElement | null;
  }
  return top;
};
