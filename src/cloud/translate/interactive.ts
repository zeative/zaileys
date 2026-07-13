import { ZaileysCloudError } from '../errors.js'

interface NativeFlowButton {
  name?: string | null
  buttonParamsJson?: string | null
}

interface InteractiveProto {
  body?: { text?: string | null } | null
  footer?: { text?: string | null } | null
  header?: { title?: string | null; subtitle?: string | null; hasMediaAttachment?: boolean | null } | null
  nativeFlowMessage?: { buttons?: NativeFlowButton[] | null } | null
}

const MAX_REPLY_BUTTONS = 3

const parseParams = (raw: string | null | undefined): Record<string, unknown> => {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Translate the builder's relay proto (interactiveMessage) into a Graph `interactive` object. */
export function translateInteractiveProto(message: Record<string, unknown>): Record<string, unknown> | null {
  const interactive = message['interactiveMessage'] as InteractiveProto | undefined
  if (!interactive) return null
  const buttons = interactive.nativeFlowMessage?.buttons ?? []
  const bodyText = interactive.body?.text ?? ' '
  const footerText = interactive.footer?.text
  const headerTitle = interactive.header?.title
  if (interactive.header?.hasMediaAttachment === true) {
    throw new ZaileysCloudError('NOT_IMPLEMENTED', 'interactive media headers are not supported on the cloud provider yet')
  }
  const shared = {
    body: { text: bodyText },
    ...(footerText ? { footer: { text: footerText } } : {}),
  }

  const single = buttons.length === 1 ? buttons[0] : undefined
  if (single?.name === 'single_select') {
    const params = parseParams(single.buttonParamsJson) as {
      title?: string
      sections?: Array<{ title?: string; rows?: Array<{ id?: string; title?: string; description?: string }> }>
    }
    return {
      type: 'list',
      ...(headerTitle ? { header: { type: 'text', text: headerTitle } } : {}),
      ...shared,
      action: {
        button: params.title ?? 'Select',
        sections: (params.sections ?? []).map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: (s.rows ?? []).map((r) => ({ id: r.id ?? '', title: r.title ?? '', description: r.description ?? '' })),
        })),
      },
    }
  }

  const replies = buttons.filter((b) => b.name === 'quick_reply')
  if (replies.length > 0 && replies.length === buttons.length) {
    if (replies.length > MAX_REPLY_BUTTONS) {
      throw new ZaileysCloudError(
        'NOT_IMPLEMENTED',
        `cloud interactive buttons allow at most ${MAX_REPLY_BUTTONS} reply buttons (got ${replies.length})`,
      )
    }
    return {
      type: 'button',
      ...(headerTitle ? { header: { type: 'text', text: headerTitle } } : {}),
      ...shared,
      action: {
        buttons: replies.map((b) => {
          const params = parseParams(b.buttonParamsJson) as { id?: string; display_text?: string }
          return { type: 'reply', reply: { id: params.id ?? '', title: params.display_text ?? '' } }
        }),
      },
    }
  }

  const cta = single && single.name === 'cta_url' ? parseParams(single.buttonParamsJson) : null
  if (cta) {
    const params = cta as { display_text?: string; url?: string }
    return {
      type: 'cta_url',
      ...(headerTitle ? { header: { type: 'text', text: headerTitle } } : {}),
      ...shared,
      action: { name: 'cta_url', parameters: { display_text: params.display_text ?? '', url: params.url ?? '' } },
    }
  }

  throw new ZaileysCloudError('NOT_IMPLEMENTED', 'this interactive layout is not supported on the cloud provider yet')
}
