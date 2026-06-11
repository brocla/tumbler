// Reset document inline styles between tests so CSS variable mutations don't bleed across tests
afterEach(() => {
  document.documentElement.style.cssText = "";
});

// Polyfill OffscreenCanvas for jsdom (not implemented in jsdom)
if (typeof globalThis.OffscreenCanvas === "undefined") {
  (globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        font: "",
        measureText: () => ({ width: 0 }),
        fillRect: () => {},
        clearRect: () => {},
        drawImage: () => {},
      };
    }
    transferToImageBitmap() {
      return {} as ImageBitmap;
    }
  };
}
