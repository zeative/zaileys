declare module 'rlottie' {
  interface Api {
    lottie_init: () => number;
    lottie_destroy: (handle: number) => null;
    lottie_resize: (handle: number, w: number, h: number) => null;
    lottie_buffer: (handle: number) => number;
    lottie_render: (handle: number, frameNo: number) => null;
    lottie_load_from_data: (handle: number, ptr: number) => number;
    HEAPU8: Uint8Array;
    _malloc: (size: number) => number;
  }
  export function init(url?: string): Api | Promise<Api>;
}
