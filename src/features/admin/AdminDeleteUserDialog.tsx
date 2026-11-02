import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { AdminUserSummary } from '@/domain/database';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export function AdminDeleteUserDialog({
  errorMessage,
  isDeleting,
  onCancel,
  onConfirm,
  user,
}: {
  errorMessage: string | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  user: AdminUserSummary;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => { if (!isDeleting) onCancel(); }}
      transparent
      visible>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="heading" themeColor="danger">
              {t('admin.deleteUser.title')}
            </ThemedText>
            <ThemedText type="smallBold">{user.display_name}</ThemedText>
            <ThemedText>
              {t('admin.deleteUser.body', { name: user.display_name })}
            </ThemedText>
            {errorMessage ? (
              <ThemedText accessibilityLiveRegion="polite" themeColor="danger">
                {errorMessage}
              </ThemedText>
            ) : null}
            <Button
              accessibilityState={{ busy: isDeleting }}
              disabled={isDeleting}
              icon="close"
              label={t(isDeleting ? 'admin.deleteUser.deleting' : 'admin.deleteUser.confirm')}
              onPress={onConfirm}
              variant="danger-solid"
            />
            <Button
              disabled={isDeleting}
              icon="back"
              label={t('admin.deleteUser.cancel')}
              onPress={onCancel}
              variant="secondary"
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  card: { borderRadius: 16, borderWidth: 1, maxHeight: '90%', maxWidth: 480, width: '100%' },
  content: { gap: Spacing.three, padding: Spacing.four },
});
