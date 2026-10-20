import * as Haptics from 'expo-haptics';
import { showAlert } from '../lib/alert';
import { mealsUsingFood } from '../lib/meals';
import { useStore } from '../lib/store';
import type { Food } from '../lib/types';
import type { TFn } from '../lib/useT';

/**
 * Asks before deleting one of the user's own foods. When saved meals contain it, the question names
 * them: the food leaves those meals too (a meal left empty goes). The diary keeps what was logged.
 */
export function confirmDeleteFood(food: Food, t: TFn, onDeleted?: () => void) {
  const used = mealsUsingFood(useStore.getState().meals, food.id);
  const message = used.length > 0 ? `${food.name}\n\n${t('delete_food_in_meals', { meals: used.map((m) => m.name).join(', ') })}` : food.name;
  showAlert(t('delete_food_q'), message, [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('delete'),
      style: 'destructive',
      onPress: () => {
        useStore.getState().removeCustomFood(food.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onDeleted?.();
      },
    },
  ]);
}
