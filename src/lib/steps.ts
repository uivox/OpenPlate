// Pure part of reading daily steps (no React Native imports), so it can be tested on its own.
// device.ts does the platform calls: the iPhone's motion sensor, Health Connect on Android.

/** Where daily steps come from: the iPhone's motion sensor, Health Connect on Android, nothing in browsers. */
export type StepSource = 'motion' | 'health_connect' | 'browser';

/**
 * Why a day's steps could or couldn't be read.
 * - `ok`: steps were read.
 * - `denied`: the person didn't allow reading steps (Motion & Fitness on the iPhone, Health Connect on Android).
 * - `not_installed`: Health Connect is missing or too old (Android 13 and older, where it's an app).
 * - `unsupported`: this device can never give steps (browsers, Android 8, phones without a step sensor).
 * - `error`: reading failed for another reason; the next try may work.
 */
export type StepStatus = 'ok' | 'denied' | 'not_installed' | 'unsupported' | 'error';

export interface StepReading {
  steps: number | null;
  status: StepStatus;
}

/** Health Connect's getSdkStatus values (SdkAvailabilityStatus in react-native-health-connect). */
export const HC_SDK_UNAVAILABLE = 1;
export const HC_SDK_PROVIDER_UPDATE_REQUIRED = 2;
export const HC_SDK_AVAILABLE = 3;

/** Health Connect's package; also its Play Store id. */
export const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
/** Play Store page for installing or updating Health Connect (`market:` opens the store app). */
export const HEALTH_CONNECT_STORE_URLS = [
  `market://details?id=${HEALTH_CONNECT_PACKAGE}&url=healthconnect%3A%2F%2Fonboarding`,
  `https://play.google.com/store/apps/details?id=${HEALTH_CONNECT_PACKAGE}`,
] as const;

/** What Health Connect's SDK status means for reading steps; null when it can be used. */
export function healthConnectProblem(sdkStatus: number): 'not_installed' | 'unsupported' | null {
  if (sdkStatus === HC_SDK_AVAILABLE) return null;
  // Not installed and "needs an update" look the same to the person: get it from the Play Store.
  if (sdkStatus === HC_SDK_PROVIDER_UPDATE_REQUIRED) return 'not_installed';
  return 'unsupported';
}

/** True when the read-steps permission is among the ones Health Connect reports as granted. */
export function hasStepsPermission(granted: readonly { accessType?: string; recordType?: string }[] | null | undefined): boolean {
  return Array.isArray(granted) && granted.some((p) => p?.accessType === 'read' && p?.recordType === 'Steps');
}

/**
 * The day's total from Health Connect's aggregate answer. Health Connect removes steps counted twice
 * (phone and watch at the same time), so this matches the total the Health Connect app shows.
 * Null when the answer isn't a plausible count.
 */
export function stepsFromAggregate(result: unknown): number | null {
  const total = (result as { COUNT_TOTAL?: unknown } | null)?.COUNT_TOTAL;
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) return null;
  // Nobody walks a million steps a day; anything above is a broken record.
  if (total > 1_000_000) return null;
  return Math.round(total);
}

/** Start and end of the day to read: midnight to midnight, or to now while the day is still running. */
export function stepRange(start: Date, end: Date, now: Date): { startTime: string; endTime: string } | null {
  const stop = end > now ? now : end;
  if (stop <= start) return null; // a future day: nothing to read yet
  return { startTime: start.toISOString(), endTime: stop.toISOString() };
}

/** The text that says why there are no steps (diary card and settings). */
export function stepsReasonKey(source: StepSource, status: StepStatus) {
  if (source === 'browser') return 'steps_reason_web' as const;
  if (status === 'error') return 'steps_reason_error' as const;
  if (source === 'motion') return 'steps_reason_ios' as const;
  if (status === 'not_installed') return 'steps_reason_hc_missing' as const;
  if (status === 'unsupported') return 'steps_reason_hc_unsupported' as const;
  return 'steps_reason_hc_denied' as const;
}

/** The button under that text, or null when there is nothing the person can do. */
export function stepsActionKey(source: StepSource, status: StepStatus) {
  if (status === 'ok' || status === 'unsupported' || status === 'error' || source === 'browser') return null;
  if (source === 'motion') return 'steps_open_settings' as const;
  return status === 'not_installed' ? ('steps_get_health_connect' as const) : ('steps_open_health_connect' as const);
}
