import { Alert, Platform, type AlertButton } from 'react-native';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface Dialog {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

type Listener = (d: Dialog) => void;
let listener: Listener | null = null;

/**
 * Drop-in for Alert.alert. React Native's Alert does nothing in the browser, so on the web the
 * dialog goes to <DialogHost /> (mounted in app/_layout.tsx). An empty button list shows a single "OK".
 */
export function showAlert(title: string, message?: string, buttons: DialogButton[] = []) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons.length ? (buttons as AlertButton[]) : undefined);
    return;
  }
  if (listener) listener({ title, message, buttons });
  else if (typeof window !== 'undefined') window.alert([title, message].filter(Boolean).join('\n\n'));
}

export function setDialogListener(l: Listener | null) {
  listener = l;
}
