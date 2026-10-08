import { Screen } from '@/components/ui/screen';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { WakeUpCallPanel } from '@/features/wake-up-call/WakeUpCallPanel';
export default function AlarmScreen() {
  return (
    <RequireAuth returnTo='/alarm'>
      <Screen safeAreaEdges={['right', 'bottom', 'left']}>
        <WakeUpCallPanel />
      </Screen>
    </RequireAuth>
  );
}
