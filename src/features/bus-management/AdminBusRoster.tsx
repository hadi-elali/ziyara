import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { AdminTripBusMember, TripBus } from '@/domain/database';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export function AdminBusRoster({ buses, disabled, onMove, roster }: {
  buses: TripBus[];
  disabled: boolean;
  onMove: (userId: string, busId: number) => void;
  roster: AdminTripBusMember[];
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<(number | null)[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const sections = [
    ...buses.map((bus) => ({ id: bus.id, name: bus.name })),
    { id: null, name: t('bus.admin.unassigned') },
  ];

  return (
    <Card style={styles.container}>
      <ThemedText type="heading">{t('bus.admin.rosterTitle')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{t('bus.admin.rosterBody')}</ThemedText>
      {sections.map((section) => {
        const members = roster.filter((person) => person.bus_id === section.id);
        const onBus = members.filter((person) => person.is_on_bus === true).length;
        const notOnBus = members.filter((person) => person.is_on_bus === false).length;
        const isExpanded = expanded.includes(section.id);
        return (
          <View key={section.id ?? 'unassigned'} style={[styles.section, { borderColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('bus.admin.rosterSection', { name: section.name, count: members.length })}
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => {
                setExpanded((current) => isExpanded ? current.filter((id) => id !== section.id) : [...current, section.id]);
                setEditingUserId(null);
              }}
              style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
              <View style={styles.text}>
                <ThemedText type="smallBold">{section.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('bus.admin.rosterCount', { count: members.length })}
                </ThemedText>
                {section.id !== null ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('bus.presence.summary', { onBus, notOnBus, unanswered: members.length - onBus - notOnBus })}
                  </ThemedText>
                ) : null}
              </View>
              <View style={isExpanded ? styles.expanded : undefined}>
                <SymbolIcon color={theme.textSecondary} name="chevron" />
              </View>
            </Pressable>
            {isExpanded ? members.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">{t('bus.admin.rosterEmpty')}</ThemedText>
            ) : members.map((person) => (
              <View key={person.user_id} style={[styles.member, { borderColor: theme.border }]}>
                <View style={styles.row}>
                  <View style={styles.text}>
                    <ThemedText type="smallBold">{person.display_name}</ThemedText>
                    {person.bus_id !== null ? (
                      <ThemedText type="small" themeColor={person.is_on_bus === true ? 'success' : 'textSecondary'}>
                        {t(person.is_on_bus === true ? 'bus.presence.onBus'
                          : person.is_on_bus === false ? 'bus.presence.notOnBus' : 'bus.presence.unanswered')}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Button
                    disabled={disabled || buses.every((bus) => bus.id === person.bus_id)}
                    icon="bus"
                    label={t('bus.admin.movePerson', { name: person.display_name })}
                    onPress={() => setEditingUserId((current) => current === person.user_id ? null : person.user_id)}
                    variant="secondary"
                  />
                </View>
                {editingUserId === person.user_id ? (
                  <View style={styles.destinations}>
                    {buses.filter((bus) => bus.id !== person.bus_id).map((bus) => (
                      <Button
                        key={bus.id}
                        disabled={disabled}
                        icon="confirm"
                        label={t('bus.admin.moveTo', { bus: bus.name })}
                        onPress={() => onMove(person.user_id, bus.id)}
                        variant="secondary"
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            )) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  section: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  toggle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 56, paddingVertical: Spacing.two },
  expanded: { transform: [{ rotate: '90deg' }] },
  text: { flex: 1, gap: Spacing.half },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  member: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.two, paddingVertical: Spacing.two },
  destinations: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pressed: { opacity: 0.72 },
});
