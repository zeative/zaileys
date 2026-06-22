import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'

export type ContactCheckResult = { jid: string; exists: boolean; lid?: string }

export class ContactModule {
  constructor(
    private readonly getSocket: () => DomainSocketLike | undefined,
    private readonly normalize: (input: string) => string,
  ) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  /** Check whether phone numbers are on WhatsApp; returns the resolved jid + existence per input. */
  async check(...numbers: string[]): Promise<ContactCheckResult[]> {
    const results = await this.requireSocket().onWhatsApp(...numbers)
    return (results ?? []).map((r) => {
      const out: ContactCheckResult = { jid: r.jid, exists: r.exists }
      if (r.lid !== undefined) out.lid = r.lid
      return out
    })
  }

  async exists(number: string): Promise<boolean> {
    const [first] = await this.check(number)
    return first?.exists ?? false
  }

  async save(jid: string, name: { firstName?: string; lastName?: string; fullName?: string }): Promise<void> {
    await this.requireSocket().addOrEditContact(this.normalize(jid), name)
  }

  async remove(jid: string): Promise<void> {
    await this.requireSocket().removeContact(this.normalize(jid))
  }
}
