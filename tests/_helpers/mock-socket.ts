import { EventEmitter } from 'node:events'
import { vi, type Mock } from 'vitest'

export interface MockSocketUser {
  id: string
  lid?: string
  name?: string
}

export interface MockSocket {
  ev: EventEmitter
  user: MockSocketUser | undefined
  authState: { creds: unknown; keys: unknown }
  end: Mock
  logout: Mock
  requestPairingCode: Mock
  sendMessage: Mock
  sendPresenceUpdate: Mock
  onWhatsApp: Mock
  groupCreate: Mock
  groupParticipantsUpdate: Mock
  groupUpdateSubject: Mock
  groupUpdateDescription: Mock
  groupLeave: Mock
  groupMetadata: Mock
  groupInviteCode: Mock
  groupRevokeInvite: Mock
  groupAcceptInvite: Mock
  groupToggleEphemeral: Mock
  groupSettingUpdate: Mock
  updateMemberLabel: Mock
  updateLastSeenPrivacy: Mock
  updateOnlinePrivacy: Mock
  updateProfilePicturePrivacy: Mock
  updateStatusPrivacy: Mock
  updateReadReceiptsPrivacy: Mock
  updateGroupsAddPrivacy: Mock
  updateDefaultDisappearingMode: Mock
  fetchPrivacySettings: Mock
  updateBlockStatus: Mock
  fetchBlocklist: Mock
  newsletterCreate: Mock
  newsletterFollow: Mock
  newsletterUnfollow: Mock
  newsletterMetadata: Mock
  newsletterUpdateName: Mock
  newsletterUpdateDescription: Mock
  newsletterUpdatePicture: Mock
  newsletterMute: Mock
  newsletterUnmute: Mock
  newsletterDelete: Mock
  communityCreate: Mock
  communityCreateGroup: Mock
  communityLinkGroup: Mock
  communityUnlinkGroup: Mock
  communityFetchLinkedGroups: Mock
  communityLeave: Mock
  communityUpdateSubject: Mock
  communityUpdateDescription: Mock
  communityInviteCode: Mock
  communityRevokeInvite: Mock
  communityAcceptInvite: Mock
  query: Mock
  triggerConnectionUpdate(update: Record<string, unknown>): void
  triggerCredsUpdate(creds: unknown): void
  setUser(user: MockSocketUser): void
}

export function createMockSocket(initial?: { user?: MockSocketUser }): MockSocket {
  const ev = new EventEmitter()
  ev.setMaxListeners(0)
  const socket: MockSocket = {
    ev,
    user: initial?.user,
    authState: { creds: {}, keys: {} },
    end: vi.fn((_err?: Error) => undefined),
    logout: vi.fn(async () => undefined),
    requestPairingCode: vi.fn(async (_phone: string) => 'MOCKCODE'),
    sendMessage: vi.fn(async (_jid: string, _content: unknown, _options?: unknown) => ({
      key: { remoteJid: _jid, id: 'mock-sent-id', fromMe: true },
    })),
    sendPresenceUpdate: vi.fn(async (_type: string, _jid?: string) => undefined),
    onWhatsApp: vi.fn(async (..._phoneNumber: string[]) => undefined),
    groupCreate: vi.fn(async (_subject: string, _participants: string[]) => ({
      id: '123@g.us',
      subject: 'mock',
      participants: [],
      owner: undefined,
    })),
    groupParticipantsUpdate: vi.fn(async (_jid: string, _participants: string[], _action: string) => [
      { status: '200', jid: 'x@s.whatsapp.net' },
    ]),
    groupUpdateSubject: vi.fn(async (_jid: string, _subject: string) => undefined),
    groupUpdateDescription: vi.fn(async (_jid: string, _description?: string) => undefined),
    groupLeave: vi.fn(async (_id: string) => undefined),
    groupMetadata: vi.fn(async (_jid: string) => ({
      id: '123@g.us',
      subject: 'mock',
      participants: [],
      owner: undefined,
    })),
    groupInviteCode: vi.fn(async (_jid: string) => 'MOCKINVITECODE'),
    groupRevokeInvite: vi.fn(async (_jid: string) => 'MOCKINVITECODE'),
    groupAcceptInvite: vi.fn(async (_code: string) => '123@g.us'),
    groupToggleEphemeral: vi.fn(async (_jid: string, _ephemeralExpiration: number) => undefined),
    groupSettingUpdate: vi.fn(async (_jid: string, _setting: string) => undefined),
    updateMemberLabel: vi.fn(async (_jid: string, _memberLabel: string) => undefined),
    updateLastSeenPrivacy: vi.fn(async (_value: string) => undefined),
    updateOnlinePrivacy: vi.fn(async (_value: string) => undefined),
    updateProfilePicturePrivacy: vi.fn(async (_value: string) => undefined),
    updateStatusPrivacy: vi.fn(async (_value: string) => undefined),
    updateReadReceiptsPrivacy: vi.fn(async (_value: string) => undefined),
    updateGroupsAddPrivacy: vi.fn(async (_value: string) => undefined),
    updateDefaultDisappearingMode: vi.fn(async (_duration: number) => undefined),
    fetchPrivacySettings: vi.fn(async (_force?: boolean) => ({
      last: 'contacts',
      online: 'all',
      profile: 'all',
      status: 'contacts',
      readreceipts: 'all',
      groupadd: 'contacts',
    })),
    updateBlockStatus: vi.fn(async (_jid: string, _action: string) => undefined),
    fetchBlocklist: vi.fn(async () => ['blocked@s.whatsapp.net']),
    newsletterCreate: vi.fn(async (_name: string, _description?: string) => ({
      id: '123@newsletter',
      name: 'mock',
      subscribers: 0,
    })),
    newsletterFollow: vi.fn(async (_jid: string) => undefined),
    newsletterUnfollow: vi.fn(async (_jid: string) => undefined),
    newsletterMetadata: vi.fn(async (_type: string, _key: string) => ({
      id: '123@newsletter',
      name: 'mock',
      subscribers: 0,
    })),
    newsletterUpdateName: vi.fn(async (_jid: string, _name: string) => undefined),
    newsletterUpdateDescription: vi.fn(async (_jid: string, _description: string) => undefined),
    newsletterUpdatePicture: vi.fn(async (_jid: string, _content: unknown) => undefined),
    newsletterMute: vi.fn(async (_jid: string) => undefined),
    newsletterUnmute: vi.fn(async (_jid: string) => undefined),
    newsletterDelete: vi.fn(async (_jid: string) => undefined),
    communityCreate: vi.fn(async (_subject: string, _body: string) => ({
      id: '123@g.us',
      subject: 'mock',
      participants: [],
      owner: undefined,
    })),
    communityCreateGroup: vi.fn(async (_subject: string, _participants: string[], _parentCommunityJid: string) => ({
      id: '456@g.us',
      subject: 'mock',
      participants: [],
      owner: undefined,
    })),
    communityLinkGroup: vi.fn(async (_groupJid: string, _parentCommunityJid: string) => undefined),
    communityUnlinkGroup: vi.fn(async (_groupJid: string, _parentCommunityJid: string) => undefined),
    communityFetchLinkedGroups: vi.fn(async (_jid: string) => ({
      communityJid: '123@g.us',
      isCommunity: true,
      linkedGroups: [{ id: '456@g.us', subject: 'sub', creation: undefined, owner: undefined, size: undefined }],
    })),
    communityLeave: vi.fn(async (_id: string) => undefined),
    communityUpdateSubject: vi.fn(async (_jid: string, _subject: string) => undefined),
    communityUpdateDescription: vi.fn(async (_jid: string, _description?: string) => undefined),
    communityInviteCode: vi.fn(async (_jid: string) => 'MOCKINVITECODE'),
    communityRevokeInvite: vi.fn(async (_jid: string) => 'MOCKINVITECODE'),
    communityAcceptInvite: vi.fn(async (_code: string) => '123@g.us'),
    query: vi.fn(async (_node: unknown) => ({ tag: 'iq', attrs: {}, content: [] })),
    triggerConnectionUpdate(update) {
      ev.emit('connection.update', update)
    },
    triggerCredsUpdate(creds) {
      ev.emit('creds.update', creds)
    },
    setUser(user) {
      socket.user = user
    },
  }
  return socket
}
