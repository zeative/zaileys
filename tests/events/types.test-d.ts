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
  MemberTagPayload,
  NewsletterPayload,
  PollVotePayload,
  PresencePayload,
  QuotedRef,
  ReactionPayload,
  SenderInfo,
} from '../../src/events/types.js'
import type { MentionAllContext, MentionContext, MessageContext } from '../../src/events/context.js'

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

describe('MessageContext (rich flat+lazy payload)', () => {
  it('text event maps to MessageContext', () => {
    expectTypeOf<InboundEventMap['text']>().toEqualTypeOf<MessageContext>()
  })

  it('exposes flat rich fields', () => {
    expectTypeOf<MessageContext>().toHaveProperty('senderId').toEqualTypeOf<string>()
    expectTypeOf<MessageContext>().toHaveProperty('text').toEqualTypeOf<string>()
    expectTypeOf<MessageContext>().toHaveProperty('isFromMe').toEqualTypeOf<boolean>()
    expectTypeOf<MessageContext>().toHaveProperty('isGroup').toEqualTypeOf<boolean>()
    expectTypeOf<MessageContext>().toHaveProperty('timestamp').toEqualTypeOf<number>()
    expectTypeOf<MessageContext>().toHaveProperty('chatType')
  })

  it('text event has lazy replied accessor', () => {
    expectTypeOf<InboundEventMap['text']>().toHaveProperty('replied')
    expectTypeOf<MessageContext['replied']>().returns.resolves.toEqualTypeOf<MessageContext | null>()
  })
})

describe('MessageContext media events', () => {
  it('image event is MessageContext with optional media', () => {
    expectTypeOf<InboundEventMap['image']>().toEqualTypeOf<MessageContext>()
    expectTypeOf<MessageContext['media']>().not.toBeAny()
  })

  it('audio event is MessageContext', () => {
    expectTypeOf<InboundEventMap['audio']>().toEqualTypeOf<MessageContext>()
  })

  it('media accessor buffer returns a Promise<Buffer>', () => {
    type Media = NonNullable<MessageContext['media']>
    expectTypeOf<Media['buffer']>().returns.resolves.toEqualTypeOf<Buffer>()
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
  it('mention event maps to MentionContext', () => {
    expectTypeOf<InboundEventMap['mention']>().toEqualTypeOf<MentionContext>()
  })

  it('mention-all event maps to MentionAllContext not MentionContext', () => {
    expectTypeOf<InboundEventMap['mention-all']>().toEqualTypeOf<MentionAllContext>()
    expectTypeOf<InboundEventMap['mention-all']>().not.toEqualTypeOf<MentionContext>()
  })

  it('MentionAllContext discriminator is literal true and lacks mentionedJids', () => {
    expectTypeOf<MentionAllContext['isMentionAll']>().toEqualTypeOf<true>()
    expectTypeOf<MentionAllContext>().not.toHaveProperty('mentionedJids')
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
