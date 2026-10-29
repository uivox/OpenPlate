import { startScreenDone } from '../lib/device';
import { useStore } from '../lib/store';
import type { useColors } from '../lib/theme';

type Colors = ReturnType<typeof useColors>;

let done = false;
let screenShown = false;
let fontsReady = false;

/** Hides the browser's start screen (phones: nothing to do), once. */
export function finishStartScreen(c: Colors): void {
  if (done) return;
  done = true;
  // One frame later, so the screen is painted before the start screen fades.
  requestAnimationFrame(() => startScreenDone({ bg: c.bg, accent: c.accent, leaf: c.leaf, face: c.accentText, text: c.text, track: c.ringTrack, still: useStore.getState().appearance.motion === 'off' }));
}

/**
 * In the browser the app renders behind the start screen while its fonts load, so the two run at
 * the same time. The start screen goes once the first screen has mounted (`Screen` in ui.tsx) and
 * the fonts are there, so text never jumps from one font to the other in view.
 */
export function noteScreenShown(c: Colors): void {
  screenShown = true;
  if (fontsReady) finishStartScreen(c);
}

export function noteFontsReady(c: Colors): void {
  fontsReady = true;
  if (screenShown) finishStartScreen(c);
}
