import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { AdminUserSummary, WakeUpCallRecipient } from '@/domain/database';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export type WakeUpCallRecipientNamesProps = {
  users: Pick<AdminUserSummary, 'user_id' | 'display_name'>[];
  isLoadingUsers: boolean;
  usersError: string | null;
  onRetryUsers: () => void;
};

export function WakeUpCallRecipients({
  recipients,
  users,
  isLoadingUsers,
  usersError,
  onRetryUsers,
}: WakeUpCallRecipientNamesProps & { recipients: WakeUpCallRecipient[] }) {
  const { t, language, isRTL } = useI18n();
  const theme = useTheme();
  const [expanded, setExpanded] = useState({ confirmed: false, pending: false });
  const names = new Map(users.map((user) => [user.user_id, user.display_name]));
  const people = recipients.map((recipient) => ({
    ...recipient,
    displayName: names.get(recipient.user_id) ?? t('wakeUp.nameUnavailable'),
  })).sort((left, right) => left.displayName.localeCompare(right.displayName, language));
  const confirmed = people.filter((person) => person.acknowledged_at !== null);
  const pending = people.filter((person) => person.acknowledged_at === null);
  const summary = t('wakeUp.confirmations', { confirmed: confirmed.length, total: people.length });
  const groups = [
    { key: 'confirmed' as const, title: t('wakeUp.confirmed', { count: confirmed.length }), people: confirmed },
    { key: 'pending' as const, title: t('wakeUp.pending', { count: pending.length }), people: pending },
  ];

  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textSecondary">{summary}</ThemedText>
      {groups.map((group) => {
        const isExpanded = expanded[group.key];
        const toggleLabel = t(isExpanded ? 'wakeUp.hideNames' : 'wakeUp.showNames');
        return (
          <View key={group.key} style={[styles.group, {
            backgroundColor: group.key === 'pending' ? theme.dangerSoft : theme.backgroundElement,
            borderColor: group.key === 'pending' ? theme.danger : theme.border,
          }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${group.title}. ${toggleLabel}`}
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}
              style={({ pressed }) => [styles.toggle, isRTL && styles.rtl, pressed && styles.pressed]}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold" themeColor={group.key === 'confirmed' ? 'success' : 'danger'}>
                  {group.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{toggleLabel}</ThemedText>
              </View>
              <View style={{ transform: [{ rotate: isExpanded ? '90deg' : isRTL ? '180deg' : '0deg' }] }}>
                <SymbolIcon color={group.key === 'pending' ? theme.danger : theme.textSecondary} name="chevron" />
              </View>
            </Pressable>
            {isExpanded ? (
              <View style={styles.names}>
                {isLoadingUsers ? (
                  <View style={styles.stack}>
                    <ActivityIndicator color={theme.accent} />
                    <ThemedText type="small" themeColor="textSecondary">{t('admin.loading')}</ThemedText>
                  </View>
                ) : usersError ? (
                  <View style={styles.stack}>
                    <ThemedText themeColor="danger">{usersError}</ThemedText>
                    <Button icon="refresh" label={t('admin.retry')} onPress={onRetryUsers} variant="secondary" />
                  </View>
                ) : group.people.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t(people.length === 0 ? 'wakeUp.noRecipients' : 'wakeUp.noPeople')}
                  </ThemedText>
                ) : group.people.map((person) => (
                  <ThemedText key={person.user_id}>{person.displayName}</ThemedText>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  toggle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 56, paddingVertical: Spacing.two },
  rtl: { flexDirection: 'row-reverse' },
  toggleText: { flex: 1, gap: Spacing.one },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: Spacing.three },
  names: { gap: Spacing.two, paddingBottom: Spacing.three },
  pressed: { opacity: 0.72 },
});
