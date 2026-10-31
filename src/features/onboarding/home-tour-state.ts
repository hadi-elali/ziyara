import { createPersistentState } from '@/features/storage/persistentState';

// Independent of the video intro, which is shown on every app launch.
export const useHomeTourState = createPersistentState(
  'ziyara.home-tour.completed.v1',
  false,
  (value) => typeof value === 'boolean' ? value : undefined,
);
