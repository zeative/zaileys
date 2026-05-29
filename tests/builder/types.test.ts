import { assertType, describe, expectTypeOf, it } from 'vitest'
import type {
  AlbumItem,
  AudioOptions,
  BuilderContext,
  BuilderState,
  ButtonDef,
  DocumentOptions,
  ImageOptions,
  ListOptions,
  ListSection,
  LocationOptions,
  MediaSource,
  PollOptions,
  StickerOptions,
  TemplateOptions,
  VideoOptions,
} from '../../src/builder/types.js'

describe('builder type surface', () => {
  it('BuilderState is the locked union', () => {
    expectTypeOf<BuilderState>().toEqualTypeOf<'init' | 'content-set'>()
  })

  it('MediaSource accepts string', () => {
    assertType<MediaSource>('path/to/file.png')
  })

  it('MediaSource accepts Buffer', () => {
    assertType<MediaSource>(Buffer.from('x'))
  })

  it('MediaSource accepts URL', () => {
    assertType<MediaSource>(new URL('https://example.com/a.png'))
  })

  it('ImageOptions fields optional', () => {
    expectTypeOf<ImageOptions>().toMatchTypeOf<{ caption?: string; viewOnce?: boolean }>()
  })

  it('VideoOptions has gifPlayback', () => {
    expectTypeOf<VideoOptions['gifPlayback']>().toEqualTypeOf<boolean | undefined>()
  })

  it('AudioOptions has ptt flag', () => {
    expectTypeOf<AudioOptions['ptt']>().toEqualTypeOf<boolean | undefined>()
  })

  it('DocumentOptions.fileName is required', () => {
    expectTypeOf<DocumentOptions>().toMatchTypeOf<{ fileName: string }>()
    expectTypeOf<Required<Pick<DocumentOptions, 'fileName'>>>().toEqualTypeOf<{ fileName: string }>()
  })

  it('StickerOptions has animated flag', () => {
    expectTypeOf<StickerOptions['animated']>().toEqualTypeOf<boolean | undefined>()
  })

  it('AlbumItem type discriminator only image|video', () => {
    expectTypeOf<AlbumItem['type']>().toEqualTypeOf<'image' | 'video'>()
    assertType<AlbumItem>({ type: 'image', src: 'a.png' })
    assertType<AlbumItem>({ type: 'video', src: 'a.mp4', caption: 'hi' })
  })

  it('ButtonDef shape', () => {
    expectTypeOf<ButtonDef>().toEqualTypeOf<{ id: string; text: string }>()
  })

  it('ListSection rows typed', () => {
    expectTypeOf<ListSection['rows']>().toEqualTypeOf<
      Array<{ id: string; title: string; description?: string }>
    >()
  })

  it('ListOptions requires buttonText + sections', () => {
    expectTypeOf<ListOptions>().toMatchTypeOf<{ buttonText: string; sections: ListSection[] }>()
  })

  it('PollOptions multipleChoice', () => {
    expectTypeOf<PollOptions['multipleChoice']>().toEqualTypeOf<boolean | undefined>()
  })

  it('LocationOptions optional fields', () => {
    expectTypeOf<LocationOptions>().toMatchTypeOf<{ name?: string; address?: string }>()
  })

  it('TemplateOptions requires body + buttons', () => {
    expectTypeOf<TemplateOptions>().toMatchTypeOf<{ body: string; buttons: ButtonDef[] }>()
  })

  it('BuilderContext requires recipient', () => {
    expectTypeOf<BuilderContext>().toMatchTypeOf<{ recipient: string }>()
  })
})
