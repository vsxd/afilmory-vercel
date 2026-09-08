interface ReadonlyItems<T> extends ReadonlyArray<DeepReadonly<T>> {}

/** Array indirection keeps recursive EXIF JSON types comparable without expanding them indefinitely. */
export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? ReadonlyItems<Item>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
