import { RequireAuth } from '@/features/auth/RequireAuth';
import { DailyProgramOverview } from '@/features/daily-program/DailyProgramOverview';

export default function ProgramScreen() {
  return (
    <RequireAuth returnTo="/program">
      <DailyProgramOverview />
    </RequireAuth>
  );
}
