import makeWASocket from 'baileys';
import { Client } from '../Classes';
import { store } from '../Library/center-store';
import { ignoreLint } from '../Utils';

export class Community {
  constructor(protected client: Client) {}

  async create(subject: string, description: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.communityCreate(subject, description);
  }

  async createGroup(subject: string, participants: string[], parentId: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.communityCreateGroup(subject, participants, parentId);
  }

  async leave(id: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.communityLeave(id);
  }

  async metadata(id: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;
    return await socket.communityMetadata(id);
  }

  async update(id: string, type: 'subject' | 'description', value: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'subject':
        return await socket.communityUpdateSubject(id, value);
      case 'description':
        return await socket.communityUpdateDescription(id, value);
    }
  }

  async group(id: string, type: 'link' | 'unlink' | 'linked', groupJid?: string) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'link':
        if (!groupJid) throw 'Group JID is required for linking';
        return await socket.communityLinkGroup(id, groupJid);
      case 'unlink':
        if (!groupJid) throw 'Group JID is required for unlinking';
        return await socket.communityUnlinkGroup(id, groupJid);
      case 'linked':
        return await socket.communityFetchLinkedGroups(id);
    }
  }

  async participants(
    id: string,
    type: 'list' | 'request-update' | 'update' | 'all',
    action?: 'add' | 'remove' | 'promote' | 'demote' | 'approve' | 'reject',
    participants?: string[],
  ) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'list':
        return await socket.communityRequestParticipantsList(id);
      case 'request-update':
        return await socket.communityRequestParticipantsUpdate(id, participants, ignoreLint(action));
      case 'update':
        if (!action || !participants) throw 'Action and participants are required for update';
        return await socket.communityParticipantsUpdate(id, participants, ignoreLint(action));
      case 'all':
        return await socket.communityFetchAllParticipating();
    }
  }

  async invite(target: string | any, type: 'code' | 'revoke' | 'accept' | 'info' | 'revokeV4' | 'acceptV4', ...args: any[]) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'code':
        return await socket.communityInviteCode(target);
      case 'revoke':
        return await socket.communityRevokeInvite(target);
      case 'accept':
        return await socket.communityAcceptInvite(target);
      case 'info':
        return await socket.communityGetInviteInfo(target);
      case 'revokeV4':
        return await socket.communityRevokeInviteV4(target, args[0]);
      case 'acceptV4':
        return await socket.communityAcceptInviteV4(target, args[0]);
    }
  }

  async settings(id: string, type: 'ephemeral' | 'update' | 'memberAdd' | 'approval', value?: any) {
    const socket = store.get('socket') as ReturnType<typeof makeWASocket>;

    switch (type) {
      case 'ephemeral':
        return await socket.communityToggleEphemeral(id, value);
      case 'update':
        return await socket.communitySettingUpdate(id, value);
      case 'memberAdd':
        return await socket.communityMemberAddMode(id, value);
      case 'approval':
        return await socket.communityJoinApprovalMode(id, value);
    }
  }
}

export class SignalCommunity {
  public community: Community;

  constructor(protected mlient: Client) {
    this.community = new Community(mlient);
  }
}
