// Stamps app.json with version 1.0.<build> so every CI build is a newer version
// (SideStore and Android only offer an update when the version goes up).
import { readFileSync, writeFileSync } from 'node:fs';

const build = Number(process.env.BUILD_NUMBER || process.argv[2] || 1);
const app = JSON.parse(readFileSync('app.json', 'utf8'));
const [major, minor] = app.expo.version.split('.');
const version = `${major}.${minor}.${build}`;
app.expo.version = version;
app.expo.ios.buildNumber = String(build);
app.expo.android.versionCode = build;
writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
console.log(version);
