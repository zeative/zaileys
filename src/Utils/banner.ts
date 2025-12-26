import qrcode from "qrcode-terminal";

export const autoDisplayQRCode = (code: string) => {
  qrcode.generate(code, { small: true }, (code) => {
    console.log(code);
  });
};

export const autoDisplayBanner = async () => {
  return;
};
