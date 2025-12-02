import z from "zod";
import { ClientOptions, ClientOptionsSchema } from "../Types";
import { parseZod } from "../Lib/zod";

export class Client {
  options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = parseZod(ClientOptionsSchema, options);
  }

  on(event: string, callback: () => void) {}
}
