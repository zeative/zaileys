import qrcodeTerminal from 'qrcode-terminal'
import { ZaileysConnectionError } from './errors.js'

export function renderQrInTerminal(qrString: string): Promise<string> {
  if (!qrString || typeof qrString !== 'string' || !qrString.trim()) {
    return Promise.reject(new ZaileysConnectionError('INVALID_OPTIONS', 'qr string is required'))
  }
  return new Promise<string>((resolve) => {
    qrcodeTerminal.generate(qrString, { small: true }, (out: string) => resolve(out))
  })
}

export async function printQrToTerminal(
  qrString: string,
  write: (s: string) => void = (s) => {
    process.stdout.write(s)
  },
): Promise<void> {
  const rendered = await renderQrInTerminal(qrString)
  write(rendered + '\n')
}
