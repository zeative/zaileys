import { Client } from '../Classes';
import { Connection } from './connection';

export class Listener {
  constructor(client: Client) {
    new Connection(client);
  }
}
