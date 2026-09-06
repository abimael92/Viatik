/**
 * exifr ships its type declarations only at the package root (`index.d.ts`),
 * which describes the `full` build. The `lite` build (used here to keep the
 * client bundle small) exposes the same named API (parse, gps, orientation, …),
 * so we reuse the root declarations for the lite ESM subpath.
 */
declare module "exifr/dist/lite.esm.js" {
  export * from "exifr";
}
