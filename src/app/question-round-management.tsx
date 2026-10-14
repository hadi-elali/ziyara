import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui/screen';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useI18n } from '@/features/i18n/i18n';
import { AdminQuestionRoundPanel } from '@/features/question-round/AdminQuestionRoundPanel';
import { questionRoundManagerRoles } from '@/features/question-round/question-round-permissions';

export default function QuestionRoundManagementScreen() {
  return (
    <RequireAuth roles={questionRoundManagerRoles} returnTo="/question-round-management">
      <QuestionRoundManagementContent />
    </RequireAuth>
  );
}
function QuestionRoundManagementContent() {
  const { t } = useI18n();

  return (
    <Screen safeAreaEdges={['right', 'bottom', 'left']}>
      <ThemedText type="title">{t('questionRound.adminTitle')}</ThemedText>
      <AdminQuestionRoundPanel />
    </Screen>
  );
}

