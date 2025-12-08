import { Client } from '../Classes';

export class SignalGroup {
  constructor(protected client: Client) {}

  group() {
    return this.client;
  }
}
