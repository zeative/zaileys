import { Client } from '../Classes';
import { Calls } from './calls';
import { Connection } from './connection';
import { Messages } from './messages';

export class Listener {
  constructor(client: Client) {
    new Connection(client);
    new Messages(client);
    new Calls(client);
  }
}
