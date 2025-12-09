import makeWASocket, { WAPrivacyGroupAddValue, WAPrivacyOnlineValue, WAPrivacyValue, WAReadReceiptsValue } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';

export class Privacy {
  constructor(protected client: Client) {}

  async block(senderId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateBlockStatus(senderId, 'block');
  }

  async unblock(senderId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateBlockStatus(senderId, 'unblock');
  }

  async lastSeen(type: WAPrivacyValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateLastSeenPrivacy(type);
  }

  async online(type: WAPrivacyOnlineValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateOnlinePrivacy(type);
  }

  async picture(type: WAPrivacyValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateProfilePicturePrivacy(type);
  }

  async status(type: WAPrivacyValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateStatusPrivacy(type);
  }

  async readReceipt(type: WAReadReceiptsValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateReadReceiptsPrivacy(type);
  }

  async groupsAdd(type: WAPrivacyGroupAddValue) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.updateGroupsAddPrivacy(type);
  }

  async ephemeral(type: 'off' | '24h' | '7d' | '90d') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const options = {
      off: 0,
      '24h': 86_400,
      '7d': 604_800,
      '90d': 7_776_000,
    };

    return await socket.updateDefaultDisappearingMode(options[type]);
  }

  async blocklist() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.fetchBlocklist();
  }

  async getSettings() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.fetchPrivacySettings(true);
  }
}

export class SignalPrivacy {
  public privacy: Privacy;

  constructor(protected plient: Client) {
    this.privacy = new Privacy(plient);
  }
}
