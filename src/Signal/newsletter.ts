import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { toBuffer } from '../Utils';

export class Newsletter {
  constructor(protected client: Client) {}

  async create(name: string, description: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterCreate(name, description);
  }

  async action(roomId: string, type: 'follow' | 'unfollow' | 'mute' | 'unmute' | '') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'follow':
        return await socket.newsletterFollow(roomId);
      case 'unfollow':
        return await socket.newsletterUnfollow(roomId);
      case 'mute':
        return await socket.newsletterMute(roomId);
      case 'unmute':
        return await socket.newsletterUnmute(roomId);
      default:
        break;
    }
  }

  async update(roomId: string, update: string | Buffer, type: 'name' | 'description' | 'picture') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isBuffer = Buffer.isBuffer(update);

    switch (type) {
      case 'name':
        if (!isBuffer) return await socket.newsletterUpdateName(roomId, update);
      case 'description':
        if (!isBuffer) return await socket.newsletterUpdateDescription(roomId, update);
      case 'picture':
        return await socket.newsletterUpdatePicture(roomId, toBuffer(update));
    }
  }

  async metadata(roomId: string, type: 'invite' | 'jid') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterMetadata(type, roomId);
  }

  async subscribers(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterSubscribers(roomId);
  }

  async reaction(roomId: string, message: string, reaction: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterReactMessage(roomId, message, reaction);
  }

  async fetchMessages(roomId: string, count: number, since: Date, after: Date) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const sinceTimestamp = since.getTime() / 1000;
    const afterTimestamp = after.getTime() / 1000;

    return await socket.newsletterFetchMessages(roomId, count, sinceTimestamp, afterTimestamp);
  }

  async adminCount(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterAdminCount(roomId);
  }

  async changeOwner(roomId: string, owner: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterChangeOwner(roomId, owner);
  }

  async demote(roomId: string, senderId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterDemote(roomId, senderId);
  }

  async delete(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterDelete(roomId);
  }

  async removePicture(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.newsletterRemovePicture(roomId);
  }
}

export class SignalNewsletter {
  public newsletter: Newsletter;

  constructor(protected nlient: Client) {
    this.newsletter = new Newsletter(nlient);
  }
}
