import z from "zod";
import { registerAuthCreds } from "../Auth";
import { parseZod } from "../Modules/zod";
import { ClientOptionsType } from "../Types";
import { autoDisplayBanner } from "../Utils/banner";
import { store } from "../Modules/store";

export class Client {
  constructor(public options: z.infer<typeof ClientOptionsType>) {
    this.options = parseZod(ClientOptionsType, options);
    this.initialize();
  }

  async initialize() {
    await autoDisplayBanner();

    await registerAuthCreds(this);
  }

  on(event: string, callback: (data: any) => void) {}
}
