/**
 * The app icon: Sprout's bowl in four faces and six colours (Settings → Appearance → App icon),
 * separate from the in-app theme. One source for everything: the settings previews draw these SVGs,
 * and scripts/make-app-icons.mjs renders them into every PNG the apps and the web app need (and
 * writes the list for the expo-alternate-app-icons plugin into app.json).
 *
 * No imports and only erasable TypeScript, so the script can load this file with Node's type
 * stripping. Pure, so tested.
 */

/** i18n key of the platform's note under the icon choice. */
export type AppIconNote = 'app_icon_note_ios' | 'app_icon_note_android' | 'app_icon_note_web';

export type IconFace = 'happy' | 'wink' | 'bright' | 'heart';
export type IconColour = 'beet' | 'ocean' | 'plum' | 'sunset' | 'mono' | 'night';
export type AppIcon = { face: IconFace; colour: IconColour };

export const ICON_FACES: IconFace[] = ['happy', 'wink', 'bright', 'heart'];
export const ICON_COLOURS: IconColour[] = ['beet', 'ocean', 'plum', 'sunset', 'mono', 'night'];
/** The icon the app ships with (no alternate icon set). */
export const DEFAULT_ICON: AppIcon = { face: 'happy', colour: 'beet' };

type Paint = { ground: string; bowl: string; face: string; leaf: string; leaf2: string };

export const ICON_PAINT: Record<IconColour, Paint> = {
  beet: { ground: '#9C2F62', bowl: '#FFF1F7', face: '#9C2F62', leaf: '#9BD27A', leaf2: '#C4E8AA' },
  ocean: { ground: '#0E7C86', bowl: '#EEFAFA', face: '#0E7C86', leaf: '#A8DE80', leaf2: '#CDEEB0' },
  plum: { ground: '#7B3FC4', bowl: '#F7F0FD', face: '#7B3FC4', leaf: '#A6DC85', leaf2: '#CBEDB2' },
  sunset: { ground: '#C9481A', bowl: '#FFF4EC', face: '#C9481A', leaf: '#B4DD86', leaf2: '#D6F0B8' },
  mono: { ground: '#161616', bowl: '#F3F3F0', face: '#161616', leaf: '#DADAD5', leaf2: '#B0B0AA' },
  night: { ground: '#1B1220', bowl: '#E26A9E', face: '#1B1220', leaf: '#8CC46A', leaf2: '#B5DE95' },
};

/** The in-app look (splash screen on the phones): beet bowl, green leaves, light face. */
const SPLASH_PAINT: Paint = { ground: 'none', bowl: '#9C2F62', face: '#FFF7FB', leaf: '#5E9A3B', leaf2: '#7EB063' };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Name the native module expects (`null` = the normal icon). Happy keeps the plain colour name the
 * earlier colour-only icons had ("Ocean"), so a choice made before still finds its icon.
 */
export function nativeIconName(icon: AppIcon): string | null {
  if (icon.face === DEFAULT_ICON.face && icon.colour === DEFAULT_ICON.colour) return null;
  return cap(icon.colour) + (icon.face === 'happy' ? '' : cap(icon.face));
}

/** Our icon for what the native module reports; anything unknown counts as the normal icon. */
export function iconFromNative(name: string | null | undefined): AppIcon {
  for (const colour of ICON_COLOURS) for (const face of ICON_FACES) if (nativeIconName({ face, colour }) === name) return { face, colour };
  return { ...DEFAULT_ICON };
}

/** Every icon but the normal one: the alternate icons the apps carry. */
export function alternateIcons(): AppIcon[] {
  const all: AppIcon[] = [];
  for (const colour of ICON_COLOURS) for (const face of ICON_FACES) if (nativeIconName({ face, colour })) all.push({ face, colour });
  return all;
}

/** Base name of an icon's image files in assets/app-icons/. */
export const iconFileName = (icon: AppIcon) => `${icon.colour}-${icon.face}`;

/** Leaves and stem, Sprout's face and the bowl, in a 120 × 120 box. */
function glyph(face: IconFace, p: Paint, cheeks: boolean): string {
  const stroke = (d: string, colour: string, width: number, extra = '') =>
    `<path d="${d}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" fill="none"${extra}/>`;
  const fill = (d: string, colour: string) => `<path d="${d}" fill="${colour}"/>`;
  const dot = (x: number, y: number, r: number, colour: string, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}"${extra}/>`;
  const cheek = (x: number, y: number) => (cheeks ? dot(x, y, 5.5, p.face, ' opacity="0.22"') : '');

  const leaves =
    face === 'heart'
      ? stroke('M60 66 L60 42', p.leaf, 7) +
        fill('M60 46 C47 38 31 30 31 18 C31 9 38 3 46 3 C53 3 57 8 60 14 Z', p.leaf) +
        fill('M60 46 C73 38 89 30 89 18 C89 9 82 3 74 3 C67 3 63 8 60 14 Z', p.leaf2)
      : stroke('M60 66 C60 52 57 44 60 33', p.leaf, 7) +
        fill('M59 45 C40 46 25 34 23 15 C43 14 58 27 59 45 Z', p.leaf) +
        fill('M61 38 C77 36 93 22 97 4 C77 3 62 18 61 38 Z', p.leaf2);
  const veins =
    face === 'bright'
      ? stroke('M56 42 Q41 33 28 20', p.face, 2, ' opacity="0.3"') + stroke('M64 35 Q80 23 93 8', p.face, 2, ' opacity="0.3"')
      : '';
  const bowl = fill('M12 66 H108 A48 48 0 0 1 12 66 Z', p.bowl) + `<rect x="8" y="59" width="104" height="13" rx="6.5" fill="${p.bowl}"/>`;

  let mien = '';
  if (face === 'happy') {
    mien =
      stroke('M39 87 Q46 79 53 87', p.face, 5) +
      stroke('M67 87 Q74 79 81 87', p.face, 5) +
      fill('M49 94 H71 Q70 107 60 107 Q50 107 49 94 Z', p.face) +
      cheek(33, 96) +
      cheek(87, 96);
  } else if (face === 'wink') {
    mien = dot(46, 86, 5.5, p.face) + stroke('M67 87 Q74 81 81 86', p.face, 5) + stroke('M50 96 Q62 106 72 94', p.face, 4.5) + cheek(86, 97);
  } else if (face === 'bright') {
    mien =
      dot(45, 86, 7.5, p.face) +
      dot(75, 86, 7.5, p.face) +
      dot(47.6, 83, 2.6, p.bowl) +
      dot(77.6, 83, 2.6, p.bowl) +
      stroke('M54 99 Q60 104 66 99', p.face, 4);
  } else {
    mien = dot(46, 86, 5.5, p.face) + dot(74, 86, 5.5, p.face) + stroke('M50 96 Q60 106 70 96', p.face, 4.5) + cheek(34, 95) + cheek(86, 95);
  }
  const all = leaves + veins + bowl + mien;
  // the wink tilts the whole bowl a little
  return face === 'wink' ? `<g transform="rotate(-7 60 62)">${all}</g>` : all;
}

/**
 * - `ios`: the full square icon (iOS rounds the corners itself; also the apple-touch icon).
 * - `rounded`: the same with rounded corners (settings previews, favicon, the web app's own icon).
 * - `foreground`: Android's adaptive-icon foreground, transparent, inside the 66 dp safe zone.
 * - `monochrome`: Android 13's themed icon, one colour with the face cut out.
 * - `maskable`: the web app's maskable icon, ground to the edges, glyph in the safe circle.
 * - `splash`: the glyph alone in the in-app colours, for the phones' splash screen.
 */
export type IconArt = 'ios' | 'rounded' | 'foreground' | 'monochrome' | 'maskable' | 'splash';

const BIG = 'translate(8.4 8) scale(0.86)';
const SAFE = 'translate(19 18) scale(0.68)';

export function iconSvg(icon: AppIcon, art: IconArt, size = 120): string {
  const p = ICON_PAINT[icon.colour];
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">`;
  const ground = (rx: number) => `<rect width="120" height="120"${rx ? ` rx="${rx}"` : ''} fill="${p.ground}"/>`;
  let body: string;
  if (art === 'ios' || art === 'rounded') body = ground(art === 'rounded' ? 27 : 0) + `<g transform="${BIG}">${glyph(icon.face, p, true)}</g>`;
  else if (art === 'maskable') body = ground(0) + `<g transform="${SAFE}">${glyph(icon.face, p, true)}</g>`;
  else if (art === 'foreground') body = `<g transform="${SAFE}">${glyph(icon.face, p, true)}</g>`;
  else if (art === 'splash') body = `<g transform="${BIG}">${glyph(icon.face, SPLASH_PAINT, false)}</g>`;
  else {
    // an alpha mask: white shapes, the face in black so it becomes a hole
    const white: Paint = { ground: 'none', bowl: '#fff', face: '#000', leaf: '#fff', leaf2: '#fff' };
    body =
      `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><g transform="${SAFE}">${glyph(icon.face, white, false)}</g></mask></defs>` +
      `<rect width="120" height="120" fill="#fff" mask="url(#m)"/>`;
  }
  return `${open}${body}</svg>`;
}

/** Background colour of an icon (Android's adaptive icon, the settings frame). */
export const iconGround = (icon: AppIcon) => ICON_PAINT[icon.colour].ground;
