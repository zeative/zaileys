import qrcodeTerminal from 'qrcode-terminal'

export function renderQrInTerminal(qrString: string): Promise<string> {
  if (!qrString || typeof qrString !== 'string' || !qrString.trim()) {
    return Promise.reject(new Error('qr string is required'))
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
