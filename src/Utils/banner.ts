import figlet from 'figlet';
import { cristal } from 'gradient-string';
import qrcode from 'qrcode-terminal';
import pkg from '../../package.json' assert { type: 'json' };
import { store } from '../Library/center-store';
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

  const version = process.env.PACKAGE_VERSION || pkg.version;
  const author = process.env.PACKAGE_AUTHOR || pkg.author;

  const latestVersion = await getLatestLibVersion();
  const isLatest = version === latestVersion;

  store.spinner.stop();

  const logoLabel = 'Zaileys';
  const copyright = `\nby ${author} · v${version}`;
  const discordUrl = `— discord.gg/KBHhTTVUc5`
  
  const updateLabel = `${isLatest ? '— Already using latest version!' : `— Update available! (v${latestVersion})`} \n`;
  const updateColor = isLatest ? 'lime' : 'orange';

  const logo = await figlet.text(logoLabel);
  const fancy = cristal(logo);

  console.log(fancy);
  console.log(logColor(copyright, 'dimgray'));
  console.log(logColor(discordUrl, 'purple'));
  console.log(logColor(updateLabel, updateColor));
};
