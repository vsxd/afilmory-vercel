import type { DependencyChunkGroup } from "./deps";

export const dependencyChunkGroups: DependencyChunkGroup[] = [
  {
    name: "react",
    patterns: ["react", "react-dom", "react-router", "scheduler"],
  },
  {
    name: "i18n",
    patterns: ["i18next", "i18next-browser-languagedetector", "react-i18next"],
  },
  {
    name: "motion",
    patterns: ["motion", "framer-motion", "motion-dom", "motion-utils"],
  },
  { name: "swiper", patterns: ["swiper"] },
  { name: "state", patterns: ["jotai", "@tanstack/*"] },
  {
    name: "ui",
    patterns: [
      "@radix-ui/*",
      "@floating-ui/*",
      "react-remove-scroll",
      "react-remove-scroll-bar",
      "react-style-singleton",
      "aria-hidden",
      "use-sidecar",
      "use-callback-ref",
      "sonner",
      "vaul",
    ],
  },
  {
    name: "masonry",
    patterns: [
      "masonic",
      "trie-memoize",
      "raf-schd",
      "@react-hook/*",
      "react-intersection-observer",
      "react-use-measure",
      "usehooks-ts",
    ],
  },
  { name: "map", patterns: ["maplibre-gl", "react-map-gl"] },
  { name: "heic", patterns: ["heic-to"] },
  {
    name: "file-type",
    patterns: [
      "file-type",
      "strtok3",
      "token-types",
      "iobuffer",
      "uint8array-extras",
      "peek-readable",
      "ieee754",
      "fflate",
    ],
  },
  { name: "zoom", patterns: ["react-zoom-pan-pinch"] },
  { name: "thumbhash", patterns: ["thumbhash"] },
  { name: "exiftool", patterns: ["@uswriting/exiftool"] },
  {
    name: "utils",
    patterns: [
      "es-toolkit",
      "clsx",
      "tailwind-merge",
      "tailwind-variants",
      "foxact",
    ],
  },
];
