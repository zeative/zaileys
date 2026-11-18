export interface MediaLogger {
  warn(obj: unknown, msg?: string): void;
}

let mediaLogger: MediaLogger | undefined;

/** Routes media warnings to a client's logger instead of stdout; process-wide, like the media limits. */
export const configureMediaLogger = (logger: MediaLogger | undefined): void => {
  mediaLogger = logger;
};

export const mediaWarn = (obj: unknown, msg: string): void => {
  mediaLogger?.warn(obj, msg);
};
