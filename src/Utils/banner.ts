import figlet from 'figlet';
import { cristal } from 'gradient-string';
import qrcode from 'qrcode-terminal';
import pkg from '../../package.json' assert { type: 'json' };
import { store } from '../Modules/store';
import { logColor } from './helper';
import { getLatestLibVersion } from './validate';

export const autoDisplayQRCode = (code: string) => {
  qrcode.generate(code, { small: true }, (code) => {
    console.log(code);
  });
};

export const autoDisplayBanner = async () => {
  console.clear();
  store.spinner.start(' Checking for updates...');

  const latestVersion = await getLatestLibVersion();
  const isLatest = pkg.version === latestVersion;

  store.spinner.stop();

  const logoLabel = 'Zaileys';
  const copyright = `\nby ${pkg.author} · v${pkg.version}`;

  const updateLabel = `${isLatest ? 'Already using latest version!' : `Update available! (v${latestVersion})`} \n`;
  const updateColor = isLatest ? 'lime' : 'orange';

  const logo = await figlet.text(logoLabel);
  const fancy = cristal(logo);

  console.log(fancy);
  console.log(logColor(copyright, '#383838ff'));
  console.log(logColor(updateLabel, updateColor));
};
