// Writes source.json: a SideStore / AltStore app source pointing at this release's IPAs.
// Add https://github.com/<owner>/<repo>/releases/latest/download/source.json in SideStore once
// and new versions appear there with an Update button.
//
// Usage: node scripts/make-source.mjs <version> <owner/repo>   (run where Tellerwerk.ipa is)
//
// During the move from OpenPlate, the source lists two apps: Tellerwerk (new app id) and the last
// OpenPlate (old app id, only shows how to move), when OpenPlate.ipa is there too. The source's own
// identifier keeps "openplate", so people who added the source before the rename keep it.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const [version, repo] = process.argv.slice(2);
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const raw = `https://raw.githubusercontent.com/${repo}/main`;
const privacy = Object.fromEntries(Object.entries(app.ios.infoPlist).filter(([k, v]) => k.endsWith('UsageDescription') && typeof v === 'string'));

const entry = ({ name, bundleIdentifier, subtitle, description, file }) => ({
  name,
  bundleIdentifier,
  developerName: 'Tellerwerk contributors',
  subtitle,
  localizedDescription: description,
  iconURL: `${raw}/assets/icon.png`,
  tintColor: '#9C2F62',
  category: 'lifestyle',
  versions: [
    {
      version,
      buildVersion: app.ios.buildNumber,
      date: new Date().toISOString(),
      downloadURL: `https://github.com/${repo}/releases/download/v${version}/${file}`,
      size: statSync(file).size,
      minOSVersion: '16.4',
      localizedDescription: `${name} ${version}`,
    },
  ],
  appPermissions: {
    entitlements: [],
    privacy: name === 'OpenPlate' ? Object.fromEntries(Object.entries(privacy).map(([k, v]) => [k, v.replace(/Tellerwerk/g, 'OpenPlate')])) : privacy,
  },
});

const apps = [
  entry({
    name: 'Tellerwerk',
    bundleIdentifier: app.ios.bundleIdentifier,
    subtitle: 'Food diary, AI photo, fasting',
    description:
      'Food diary with calories and macros, barcode scanner, AI photo logging with your own AI, intermittent fasting, water, weight and steps. German and English. Formerly OpenPlate.\n\nNo account: Tellerwerk doesn’t know who you are. Your diary, weights and settings stay on your device; there is no Tellerwerk server. Nothing is sent unless you start it, and Profile → Your data shows every server the app can talk to and a log of its connections.\n\nComing from OpenPlate? Export your data in OpenPlate (Profile → Export data) and import the file here (Profile → Import data).',
    file: 'Tellerwerk.ipa',
  }),
];
if (existsSync('OpenPlate.ipa')) {
  apps.push(
    entry({
      name: 'OpenPlate',
      bundleIdentifier: 'io.github.uivox.openplate',
      subtitle: 'Now Tellerwerk: update to move',
      description:
        'OpenPlate is now Tellerwerk. This last version of OpenPlate only shows how to move: export your data, install Tellerwerk from this source, import the file there, then delete OpenPlate.',
      file: 'OpenPlate.ipa',
    }),
  );
}

const source = {
  name: 'Tellerwerk',
  identifier: `io.github.${repo.split('/')[0].toLowerCase()}.openplate.source`,
  subtitle: 'Free, open-source calorie tracker',
  website: `https://github.com/${repo}`,
  iconURL: `${raw}/assets/icon.png`,
  tintColor: '#9C2F62',
  apps,
  news: [],
};
writeFileSync('source.json', JSON.stringify(source, null, 2) + '\n');
console.log('source.json written for', version, 'with', apps.map((a) => a.name).join(' and '));
