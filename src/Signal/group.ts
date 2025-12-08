import { Client } from '../Classes';

export class SignalGroup {
  constructor(protected glient: Client) {}

  group() {
    return this.glient;
  }
}
