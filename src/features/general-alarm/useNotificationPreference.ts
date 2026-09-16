import { createPersistentState } from '@/features/storage/persistentState';

export const useNotificationsDisabled = createPersistentState<boolean>(
  'ziyara.notifications.disabled',
  false,
  (value) => (typeof value === 'boolean' ? value : undefined),
);
