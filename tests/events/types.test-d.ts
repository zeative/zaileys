import { describe, expectTypeOf, it } from 'vitest'
import type {
  ButtonClickPayload,
  CallPayload,
  DeletePayload,
  EditPayload,
  GroupJoinPayload,
  GroupLeavePayload,
  GroupUpdatePayload,
  HistorySyncPayload,
  InboundEventMap,
  InboundEventName,
  LimitedPayload,
  ListSelectPayload,
  MediaPayload,
  MemberTagPayload,
  MentionAllPayload,
  MentionPayload,
  MessagePayload,
  NewsletterPayload,
  PollVotePayload,
  PresencePayload,
  QuotedRef,
  ReactionPayload,
  SenderInfo,
} from '../../src/events/types.js'

describe('InboundEventMap keys', () => {
  it('enumerates exactly 24 event keys', () => {
    expectTypeOf<InboundEventName>().toEqualTypeOf<
      | 'text'
      | 'image'
      | 'video'
      | 'audio'
      | 'document'
      | 'sticker'
      | 'reaction'
      | 'edit'
      | 'delete'
      | 'poll-vote'
      | 'button-click'
      | 'list-select'
      | 'mention'
      | 'mention-all'
      | 'group-update'
      | 'group-join'
      | 'group-leave'
      | 'member-tag'
      | 'call-incoming'
      | 'call-ended'
      | 'history-sync'
      | 'limited'
      | 'presence'
      | 'newsletter'
    >()
  })

  it('no payload type resolves to any', () => {
    expectTypeOf<InboundEventMap['text']>().not.toBeAny()
    expectTypeOf<InboundEventMap['image']>().not.toBeAny()
    expectTypeOf<InboundEventMap['newsletter']>().not.toBeAny()
    expectTypeOf<InboundEventMap['limited']>().not.toBeAny()
  })
})

describe('MessagePayload', () => {
  it('text event maps to MessagePayload', () => {
    expectTypeOf<InboundEventMap['text']>().toEqualTypeOf<MessagePayload>()
  })

  it('exposes core fields', () => {
    expectTypeOf<MessagePayload>().toHaveProperty('jid').toEqualTypeOf<string>()
    expectTypeOf<MessagePayload>().toHaveProperty('content').toEqualTypeOf<string>()
    expectTypeOf<MessagePayload>().toHaveProperty('fromMe').toEqualTypeOf<boolean>()
    expectTypeOf<MessagePayload>().toHaveProperty('isGroup').toEqualTypeOf<boolean>()
    expectTypeOf<MessagePayload>().toHaveProperty('timestamp').toEqualTypeOf<number>()
    expectTypeOf<MessagePayload>().toHaveProperty('sender').toEqualTypeOf<SenderInfo>()
  })

  it('text event does not carry media', () => {
    expectTypeOf<InboundEventMap['text']>().not.toHaveProperty('media')
  })
})

describe('MediaPayload', () => {
  it('image event carries media + download', () => {
    expectTypeOf<InboundEventMap['image']>().toHaveProperty('media')
    expectTypeOf<InboundEventMap['image']>().toHaveProperty('download')
    expectTypeOf<MediaPayload<'image'>['download']>().returns.resolves.toHaveProperty('buffer')
  })

  it('audio media exposes optional ptt boolean', () => {
    expectTypeOf<InboundEventMap['audio']['media']['ptt']>().toEqualTypeOf<boolean | undefined>()
  })

  it('image kind is narrowed', () => {
    expectTypeOf<InboundEventMap['image']['kind']>().toEqualTypeOf<'image'>()
  })
})

describe('mutation payloads', () => {
  it('ReactionPayload emoji is nullable', () => {
    expectTypeOf<ReactionPayload['emoji']>().toEqualTypeOf<string | null>()
  })

  it('EditPayload carries newContent', () => {
    expectTypeOf<EditPayload>().toHaveProperty('newContent').toEqualTypeOf<string>()
  })

  it('DeletePayload deletedFor is everyone | me', () => {
    expectTypeOf<DeletePayload['deletedFor']>().toEqualTypeOf<'everyone' | 'me'>()
  })

  it('PollVotePayload lists selected options', () => {
    expectTypeOf<PollVotePayload['selectedOptions']>().toEqualTypeOf<string[]>()
  })
})

describe('interactive payloads', () => {
  it('ButtonClickPayload carries buttonId', () => {
    expectTypeOf<ButtonClickPayload>().toHaveProperty('buttonId').toEqualTypeOf<string>()
  })

  it('ListSelectPayload carries rowId', () => {
    expectTypeOf<ListSelectPayload>().toHaveProperty('rowId').toEqualTypeOf<string>()
  })
})

describe('mention vs mention-all', () => {
  it('mention event maps to MentionPayload', () => {
    expectTypeOf<InboundEventMap['mention']>().toEqualTypeOf<MentionPayload>()
  })

  it('mention-all event maps to MentionAllPayload not MentionPayload', () => {
    expectTypeOf<InboundEventMap['mention-all']>().toEqualTypeOf<MentionAllPayload>()
    expectTypeOf<InboundEventMap['mention-all']>().not.toEqualTypeOf<MentionPayload>()
  })

  it('MentionAllPayload discriminator is literal true and drops mentionedJids', () => {
    expectTypeOf<MentionAllPayload['isMentionAll']>().toEqualTypeOf<true>()
    expectTypeOf<MentionAllPayload>().not.toHaveProperty('mentionedJids')
  })
})

describe('group payloads', () => {
  it('GroupUpdatePayload update is partial', () => {
    expectTypeOf<GroupUpdatePayload['update']>().toHaveProperty('subject')
  })

  it('GroupJoinPayload action excludes remove/leave', () => {
    expectTypeOf<GroupJoinPayload['action']>().toEqualTypeOf<'add' | 'invite' | 'invite-link'>()
  })

  it('GroupLeavePayload action is remove | leave', () => {
    expectTypeOf<GroupLeavePayload['action']>().toEqualTypeOf<'remove' | 'leave'>()
  })

  it('MemberTagPayload carries label', () => {
    expectTypeOf<MemberTagPayload>().toHaveProperty('label').toEqualTypeOf<string>()
  })
})

describe('lifecycle discriminated unions', () => {
  it('CallPayload narrows on kind', () => {
    type Incoming = Extract<CallPayload, { kind: 'incoming' }>
    expectTypeOf<Incoming['callId']>().toEqualTypeOf<string>()
    expectTypeOf<InboundEventMap['call-incoming']['kind']>().toEqualTypeOf<'incoming'>()
    expectTypeOf<InboundEventMap['call-ended']['kind']>().toEqualTypeOf<'ended'>()
  })

  it('HistorySyncPayload status is complete | paused', () => {
    expectTypeOf<HistorySyncPayload['status']>().toEqualTypeOf<'complete' | 'paused'>()
  })

  it('LimitedPayload narrows on reason', () => {
    type Timelock = Extract<LimitedPayload, { reason: 'reachout-timelock' }>
    expectTypeOf<Timelock['retryAt']>().toEqualTypeOf<number>()
  })

  it('PresencePayload status enumerates 5 states', () => {
    expectTypeOf<PresencePayload['status']>().toEqualTypeOf<
      'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
    >()
  })

  it('NewsletterPayload narrows on action', () => {
    type Reaction = Extract<NewsletterPayload, { action: 'reaction' }>
    expectTypeOf<Reaction['newsletterId']>().toEqualTypeOf<string>()
  })
})

describe('shared helper types', () => {
  it('SenderInfo shape', () => {
    expectTypeOf<SenderInfo>().toHaveProperty('jid').toEqualTypeOf<string>()
    expectTypeOf<SenderInfo['pushName']>().toEqualTypeOf<string | undefined>()
  })

  it('QuotedRef carries key', () => {
    expectTypeOf<QuotedRef>().toHaveProperty('key')
  })
})
