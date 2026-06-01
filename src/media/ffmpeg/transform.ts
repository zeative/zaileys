import { FFmpegProcessor, FileManager, type FileExtension } from './core.js';

/**
 * Run a single ffmpeg transform: write `buffer` to a temp `inExt` file, encode it
 * to a temp `outExt` file with `options`, and return the output bytes. Temp files
 * are always cleaned up; failures are rethrown as `"<label> failed: <reason>"`.
 *
 * `options` may be an array, or a callback receiving the written input path (for
 * options that depend on probing the source, e.g. duration).
 */
export const ffmpegTransform = async (
  buffer: Buffer,
  inExt: FileExtension,
  outExt: FileExtension,
  label: string,
  options: string[] | ((tempIn: string) => string[] | Promise<string[]>),
): Promise<Buffer> => {
  const slug = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const tempIn = FileManager.createTempPath(`${slug}_in`, inExt);
  const tempOut = FileManager.createTempPath(`${slug}_out`, outExt);
  await FileManager.safeWriteFile(tempIn, buffer);
  try {
    const resolved = typeof options === 'function' ? await options(tempIn) : options;
    await FFmpegProcessor.process({
      input: tempIn,
      output: tempOut,
      options: resolved,
      onEnd: async () => undefined,
      onError: async () => undefined,
    });
    return await FileManager.safeReadFile(tempOut);
  } catch (error: unknown) {
    throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await FileManager.cleanup([tempIn, tempOut]);
  }
};
