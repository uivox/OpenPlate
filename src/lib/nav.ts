import { router } from 'expo-router';

/** Closes the add-food flow and returns to the tabs. */
export function leaveToDiary() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}
