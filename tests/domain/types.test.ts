import { describe, expectTypeOf, it } from 'vitest'
import type {
  GroupMetadata,
  LinkedGroup,
  NewsletterMetadata,
  ParticipantAction,
  ParticipantUpdateResult,
  PrivacyConfig,
  PrivacySettings,
  WAMediaUpload,
  WAPrivacyGroupAddValue,
  WAPrivacyOnlineValue,
  WAPrivacyValue,
  WAReadReceiptsValue,
} from '../../src/domain/types.js'

describe('domain types', () => {
  it('ParticipantUpdateResult has jid and status', () => {
    expectTypeOf<ParticipantUpdateResult>().toMatchTypeOf<{ jid: string; status: string }>()
    expectTypeOf<ParticipantUpdateResult['jid']>().toEqualTypeOf<string>()
    expectTypeOf<ParticipantUpdateResult['status']>().toEqualTypeOf<string>()
  })

  it('WAPrivacyValue accepts the four privacy levels', () => {
    expectTypeOf<'all'>().toMatchTypeOf<WAPrivacyValue>()
    expectTypeOf<'contacts'>().toMatchTypeOf<WAPrivacyValue>()
    expectTypeOf<'contact_blacklist'>().toMatchTypeOf<WAPrivacyValue>()
    expectTypeOf<'none'>().toMatchTypeOf<WAPrivacyValue>()
  })

  it('WAPrivacyOnlineValue accepts all and match_last_seen', () => {
    expectTypeOf<'all'>().toMatchTypeOf<WAPrivacyOnlineValue>()
    expectTypeOf<'match_last_seen'>().toMatchTypeOf<WAPrivacyOnlineValue>()
  })

  it('WAReadReceiptsValue accepts all and none', () => {
    expectTypeOf<'all'>().toMatchTypeOf<WAReadReceiptsValue>()
    expectTypeOf<'none'>().toMatchTypeOf<WAReadReceiptsValue>()
  })

  it('PrivacyConfig keys are all optional enum values', () => {
    expectTypeOf<PrivacyConfig['lastSeen']>().toEqualTypeOf<WAPrivacyValue | undefined>()
    expectTypeOf<PrivacyConfig['online']>().toEqualTypeOf<WAPrivacyOnlineValue | undefined>()
    expectTypeOf<PrivacyConfig['profile']>().toEqualTypeOf<WAPrivacyValue | undefined>()
    expectTypeOf<PrivacyConfig['status']>().toEqualTypeOf<WAPrivacyValue | undefined>()
    expectTypeOf<PrivacyConfig['readReceipts']>().toEqualTypeOf<WAReadReceiptsValue | undefined>()
    expectTypeOf<PrivacyConfig['groupAdd']>().toEqualTypeOf<WAPrivacyGroupAddValue | undefined>()
  })

  it('PrivacySettings is a string-keyed string map', () => {
    expectTypeOf<PrivacySettings>().toEqualTypeOf<{ [key: string]: string }>()
  })

  it('LinkedGroup has required subject and optional metadata', () => {
    expectTypeOf<LinkedGroup['subject']>().toEqualTypeOf<string>()
    expectTypeOf<LinkedGroup['id']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<LinkedGroup['creation']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<LinkedGroup['owner']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<LinkedGroup['size']>().toEqualTypeOf<number | undefined>()
  })

  it('re-exports baileys types without redefining them', () => {
    expectTypeOf<GroupMetadata>().not.toBeNever()
    expectTypeOf<NewsletterMetadata>().not.toBeNever()
    expectTypeOf<WAMediaUpload>().not.toBeNever()
    expectTypeOf<ParticipantAction>().not.toBeNever()
  })
})
