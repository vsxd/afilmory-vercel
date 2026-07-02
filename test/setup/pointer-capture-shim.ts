// jsdom (29.x) implements `PointerEvent` but NOT the pointer-capture methods
// (`setPointerCapture` / `releasePointerCapture` / `hasPointerCapture`).
//
// Production code (WebGL input controller + the photo-viewer dismiss gesture)
// calls them defensively via optional chaining — `el.setPointerCapture?.(id)` —
// so unit tests pass without this shim (the calls become no-ops). This stub is
// additive: it lets tests spy on the capture calls and exercise the
// `lostpointercapture` arbitration flow meaningfully. Idempotent and harmless
// for tests that never touch pointer capture.
if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}
