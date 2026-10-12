// Writes source.json: a SideStore / AltStore app source pointing at this release's IPA.
// Add https://github.com/<owner>/<repo>/releases/latest/download/source.json in SideStore once
// and new versions appear there with an Update button.
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const [ipaPath, version, repo] = process.argv.slice(2);
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const raw = `https://raw.githubusercontent.com/${repo}/main`;
const source = {
  name: 'OpenPlate',
  identifier: `io.github.${repo.split('/')[0].toLowerCase()}.openplate.source`,
  subtitle: 'Free, open-source calorie tracker',
  website: `https://github.com/${repo}`,
  iconURL: `${raw}/assets/icon.png`,
  tintColor: '#9C2F62',
  apps: [
    {
      name: 'OpenPlate',
      bundleIdentifier: app.ios.bundleIdentifier,
      developerName: 'OpenPlate contributors',
      subtitle: 'Food diary, AI photo, fasting',
      localizedDescription:
        'Food diary with calories and macros, barcode scanner, AI photo logging with your own AI, intermittent fasting, water, weight and steps. German and English.',
      iconURL: `${raw}/assets/icon.png`,
      tintColor: '#9C2F62',
      category: 'lifestyle',
      versions: [
        {
          version,
          buildVersion: app.ios.buildNumber,
          date: new Date().toISOString(),
          downloadURL: `https://github.com/${repo}/releases/download/v${version}/OpenPlate.ipa`,
          size: statSync(ipaPath).size,
          minOSVersion: '16.4',
          localizedDescription: `OpenPlate ${version}`,
        },
      ],
      appPermissions: {
        entitlements: [],
        privacy: Object.fromEntries(Object.entries(app.ios.infoPlist).filter(([k, v]) => k.endsWith('UsageDescription') && typeof v === 'string')),
      },
    },
  ],
  news: [],
};
writeFileSync('source.json', JSON.stringify(source, null, 2) + '\n');
console.log('source.json written for', version);
