import { Client } from './client';

export class Signal {
  constructor(protected client: Client) {
    this.initialize();
  }

  protected initialize() {}

  anjay() {
    console.log('anjay');
  }
}
