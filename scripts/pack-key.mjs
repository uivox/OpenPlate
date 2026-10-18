// Creates the key pair that signs the offline product pack. Run it once, on your own computer:
//   node scripts/pack-key.mjs
// It prints:
// - the PRIVATE key: paste it into the GitHub secret OFFLINE_PACK_PRIVATE_KEY (environment
//   "offline-pack"), then delete it from your screen/clipboard. Never commit it or post it anywhere.
// - the PUBLIC key: goes into PACK_PUBLIC_KEY in src/lib/offlinePack.ts (public, safe to commit).
// Nothing is written to disk.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
const priv = privateKey.export({ format: 'pem', type: 'pkcs8' });

console.log('PRIVATE key (GitHub secret OFFLINE_PACK_PRIVATE_KEY, keep it secret):\n');
console.log(priv);
console.log('PUBLIC key (PACK_PUBLIC_KEY in src/lib/offlinePack.ts):\n');
console.log(pub);
