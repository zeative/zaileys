import z from "zod";
import { parseZod } from "../Lib/zod";
import { ClientOptionsType } from "../Types";
import { autoDisplayBanner } from "../Config/banner";
import { store } from "../Modules/store";

export class Client {
  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this.initialize();
  }

  async initialize() {
    await autoDisplayBanner();
  }

  on(event: string, callback: (data: any) => void) {}
}
