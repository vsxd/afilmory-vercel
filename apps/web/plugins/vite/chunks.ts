import type { DependencyChunkGroup } from "./deps";

export const dependencyChunkGroups: DependencyChunkGroup[] = [
  {
    name: "react",
    patterns: ["react", "react-dom", "react-router", "scheduler"],
  },
  {
    name: "i18n",
    patterns: ["i18next", "react-i18next"],
  },
  {
    name: "motion",
    patterns: ["motion", "framer-motion", "motion-dom", "motion-utils"],
  },
  { name: "swiper", patterns: ["swiper"] },
  { name: "state", patterns: ["jotai", "@tanstack/*"] },
  {
    // Radix primitives share internal scope factories (for example ContextMenu
    // builds on Menu). Splitting those tightly coupled modules across manual
    // chunks can create a cross-chunk ESM initialization cycle in production.
    // Keep the complete primitive family and its overlay helpers together.
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
      "vaul",
      "sonner",
    ],
  },
  {
    // masonic 已被自研虚拟 masonry 取代并移除；这里只剩测量/可见性 observer 相关库。
    name: "observers",
    patterns: [
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
      // file-type patches ZipHandler.prototype during module evaluation. Keep
      // the handler with its token readers so automatic chunking cannot create
      // a vendor -> shared -> vendor cycle with an uninitialized ZipHandler.
      "@tokenizer/inflate",
      "@borewit/text-codec",
      "debug",
      "ms",
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
