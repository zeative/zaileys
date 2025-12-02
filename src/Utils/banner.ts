import figlet from 'figlet';
import gradient, { cristal } from 'gradient-string';
import pkg from '../../package.json' assert { type: 'json' };
import { store } from '../Modules/store';
import { checkLatestLibVersion } from './validate';

export const autoDisplayBanner = async () => {
  console.clear();
  store.spinner.start('Checking for updates...');

  const latestVersion = await checkLatestLibVersion();
  const isLatest = pkg.version === latestVersion;

  store.spinner.stop();

  const logoLabel = 'Zaileys';
  const copyright = `\nby ${pkg.author} · v${pkg.version}`;

  const updateLabel = `${isLatest ? 'Already using latest version!' : `Update available! (v${latestVersion})`} \n`;
  const updateColor = isLatest ? ['#04ba25ff', '#04ba25ff'] : ['#ffaf00ff', '#ffaf00ff'];

  const logo = await figlet.text(logoLabel);
  const fancy = cristal(logo);

  console.log(fancy);
  console.log(gradient(['#383838ff', '#383838ff'])(copyright));
  console.log(gradient(updateColor)(updateLabel));
};
