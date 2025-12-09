import makeWASocket, { ParticipantAction } from 'baileys';
import { Client } from '../Classes';
import { store } from '../Modules/store';
import { numbersToJids, toBuffer } from '../Utils';

export class Group {
  constructor(protected client: Client) {}

  async create(name: string, participants: number[]) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupCreate(name, numbersToJids(participants));
  }

  async participant(roomId: string, participants: number[], action: ParticipantAction) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupParticipantsUpdate(roomId, numbersToJids(participants), action);
  }

  async profile(roomId: string, update: string | Buffer, type: 'subject' | 'description' | 'avatar') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isBuffer = Buffer.isBuffer(update);

    switch (type) {
      case 'subject':
        if (!isBuffer) return await socket.groupUpdateSubject(roomId, update);
      case 'description':
        if (!isBuffer) return await socket.groupUpdateDescription(roomId, update);
      case 'avatar':
        return await socket.updateProfilePicture(roomId, toBuffer(update));
    }
  }

  async setting(roomId: string, type: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupSettingUpdate(roomId, type);
  }

  async leave(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupLeave(roomId);
  }

  async inviteCode(roomId: string, type: 'code' | 'revoke' | 'accept' | 'info') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'code':
        return await socket.groupInviteCode(roomId);
      case 'revoke':
        return await socket.groupRevokeInvite(roomId);
      case 'accept':
        return await socket.groupAcceptInvite(roomId);
      case 'info':
        return await socket.groupGetInviteInfo(roomId);
    }
  }
}

export class SignalGroup {
  public group: Group;

  constructor(protected glient: Client) {
    this.group = new Group(glient);
  }
}
