import makeWASocket, { ParticipantAction } from 'baileys';
import { Client } from '../Classes';
import { groupCache } from '../Config/cache';
import { store } from '../Library/center-store';
import { mediaModifier } from '../Library/media-modifier';

export class Group {
  constructor(protected client: Client) {}

  async create(name: string, participants: string[]) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupCreate(name, participants);
  }

  async participant(roomId: string, participants: string[], action: ParticipantAction) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupParticipantsUpdate(roomId, participants, action);
  }

  async profile(roomId: string, update: string | Buffer, type: 'subject' | 'description' | 'picture') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    const isBuffer = Buffer.isBuffer(update);

    switch (type) {
      case 'subject':
        if (!isBuffer) return await socket.groupUpdateSubject(roomId, update);
      case 'description':
        if (!isBuffer) return await socket.groupUpdateDescription(roomId, update);
      case 'picture':
        return await socket.updateProfilePicture(roomId, await mediaModifier.toBuffer(update));
    }
  }

  async setting(roomId: string, type: 'open' | 'close' | 'locked' | 'unlocked' | 'all_member_add' | 'admin_add') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'open':
        return await socket.groupSettingUpdate(roomId, 'not_announcement');
      case 'close':
        return await socket.groupSettingUpdate(roomId, 'announcement');
      case 'locked':
        return await socket.groupSettingUpdate(roomId, type);
      case 'unlocked':
        return await socket.groupSettingUpdate(roomId, type);
      case 'all_member_add':
        return await socket.groupMemberAddMode(roomId, type);
      case 'admin_add':
        return await socket.groupMemberAddMode(roomId, type);
    }
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

  async metadata(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const cached = groupCache.get(roomId) as any;
    if (cached) return cached;

    const metadata = await socket.groupMetadata(roomId);
    if (metadata) {
      groupCache.set(roomId, metadata);
    }

    return metadata;
  }

  async requestJoin(roomId: string, participants: string[], type: 'approve' | 'reject') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'approve':
        return await socket.groupRequestParticipantsUpdate(roomId, participants, type);
      case 'reject':
        return await socket.groupRequestParticipantsUpdate(roomId, participants, type);
    }
  }

  async requestJoinList(roomId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupRequestParticipantsList(roomId);
  }

  async fetchAllGroups() {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.groupFetchAllParticipating();
  }

  async ephemeral(roomId: string, type: 'off' | '24h' | '7d' | '90d') {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    const options = {
      off: 0,
      '24h': 86_400,
      '7d': 604_800,
      '90d': 7_776_000,
    };

    return await socket.groupToggleEphemeral(roomId, options[type]);
  }
}

export class SignalGroup {
  public group: Group;

  constructor(protected glient: Client) {
    this.group = new Group(glient);
  }
}
