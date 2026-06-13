import { describe, expect, it, vi } from 'vitest'

const loadMediaMock = vi.fn(async (src: unknown) => {
  const tag = String(src)
  const buffer = Buffer.from(tag.includes('vid') ? 'VID' : 'IMG')
  return { buffer, mime: tag.includes('vid') ? 'video/mp4' : 'image/jpeg', size: buffer.length }
})

vi.mock('../../src/builder/media-loader.js', () => ({
  loadMedia: (src: unknown) => loadMediaMock(src),
}))

import { MessageBuilder } from '../../src/builder/builder.js'
import { Scheduler, ZaileysAutomationError } from '../../src/automation/index.js'
import type { AlbumItem } from '../../src/builder/types.js'
import type { MessageStore, ScheduledContentSnapshot } from '../../src/store/types.js'

const JID = 'g@g.us'

const makeScheduler = () => {
  const sendSnapshot = vi.fn(async (_s: ScheduledContentSnapshot) => undefined)
  const scheduler = new Scheduler({
    store: {} as MessageStore,
    sendSnapshot: sendSnapshot as never,
    now: () => Date.now(),
  })
  return { scheduler, sendSnapshot }
}

describe('Scheduler — album/multi-part rejection', () => {
  it('rejects scheduling an album instead of silently capturing one item', async () => {
    const { scheduler, sendSnapshot } = makeScheduler()
    const items: AlbumItem[] = [
      { type: 'image', src: 'img-0' },
      { type: 'image', src: 'img-1' },
    ]
    await expect(
      scheduler.scheduleAt(new Date(Date.now() + 1000), (b) => b.to(JID).album(items)),
    ).rejects.toMatchObject({ code: 'SCHEDULE_INVALID' })
    expect(sendSnapshot).not.toHaveBeenCalled()
  })

  it('still schedules a plain text message', async () => {
    const { scheduler } = makeScheduler()
    const handle = await scheduler.scheduleAt(new Date(Date.now() + 1000), (b) =>
      b.to(JID).text('hello'),
    )
    expect(typeof handle.id).toBe('string')
    expect(ZaileysAutomationError).toBeDefined()
  })
})
