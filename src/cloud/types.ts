import { ZaileysCloudError } from './errors.js'

export interface CloudOptions {
  /** Permanent or system-user access token for the WhatsApp Business app. */
  accessToken: string
  /** Sender phone-number id (not the phone number itself). */
  phoneNumberId: string
  /** WhatsApp Business Account id — optional, needed only for account-level ops. */
  wabaId?: string
  /** Token echoed back on the webhook GET verification challenge. */
  verifyToken?: string
  /** Meta app secret; enables X-Hub-Signature-256 verification of webhook POSTs. */
  appSecret?: string
  /** Graph API version, e.g. 'v23.0'. Defaults to the pinned stable version. */
  apiVersion?: string
  /** Override the Graph API origin (tests / proxies). */
  baseUrl?: string
}

export function validateCloudOptions(cloud: CloudOptions | undefined): CloudOptions {
  if (!cloud || typeof cloud.accessToken !== 'string' || cloud.accessToken.length === 0) {
    throw new ZaileysCloudError('CONFIG', "provider 'cloud' requires cloud.accessToken")
  }
  if (typeof cloud.phoneNumberId !== 'string' || cloud.phoneNumberId.length === 0) {
    throw new ZaileysCloudError('CONFIG', "provider 'cloud' requires cloud.phoneNumberId")
  }
  return cloud
}
