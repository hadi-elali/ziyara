import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { maximumRegistrationFamilyMembers } from '@/domain/registration';
import { BirthDateField } from '@/features/auth/BirthDateField';
import type { RegistrationFamilyMemberDraft } from '@/features/auth/registration-family';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export type RegistrationFamilyDraft = RegistrationFamilyMemberDraft & { id: number };

export function RegistrationFamilyFields({
  disabled,
  members,
  onAdd,
  onChange,
  onRemove,
}: {
  disabled: boolean;
  members: readonly RegistrationFamilyDraft[];
  onAdd: () => void;
  onChange: (id: number, field: keyof RegistrationFamilyMemberDraft, value: string) => void;
  onRemove: (id: number) => void;
}) {
  const theme = useTheme();
  const { isRTL, t } = useI18n();

  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">{t('auth.familyMembers.title')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('auth.familyMembers.body')}
      </ThemedText>
      {members.map((member, index) => (
        <View key={member.id} style={[styles.member, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">
            {t('auth.familyMembers.member', { number: index + 1 })}
          </ThemedText>
          {(['name', 'surname'] as const).map(field => {
            const label = t(field === 'name' ? 'auth.firstName' : 'auth.surname');
            return (
              <View key={field} style={styles.field}>
                <ThemedText type="small">{label}</ThemedText>
                <TextInput
                  accessibilityLabel={t('auth.familyMembers.fieldLabel', {
                    field: label,
                    number: index + 1,
                  })}
                  autoCapitalize="words"
                  autoComplete="off"
                  editable={!disabled}
                  maxLength={80}
                  onChangeText={value => onChange(member.id, field, value)}
                  placeholder={label}
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                      textAlign: isRTL ? 'right' : 'left',
                      writingDirection: isRTL ? 'rtl' : 'ltr',
                    },
                  ]}
                  value={member[field]}
                />
              </View>
            );
          })}
          <BirthDateField
            accessibilityLabel={t('auth.familyMembers.fieldLabel', {
              field: t('auth.familyMembers.birthDate'),
              number: index + 1,
            })}
            disabled={disabled}
            onChange={value => onChange(member.id, 'birthDate', value)}
            value={member.birthDate}
          />
          <Button
            disabled={disabled || members.length <= 1}
            icon="minus"
            label={t('auth.familyMembers.remove', { number: index + 1 })}
            onPress={() => onRemove(member.id)}
            variant="ghost"
          />
        </View>
      ))}
      <Button
        disabled={disabled || members.length >= maximumRegistrationFamilyMembers}
        icon="plus"
        label={t('auth.familyMembers.add')}
        onPress={onAdd}
        variant="secondary"
      />
      <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
        {t('auth.familyMembers.total', { count: members.length + 1 })}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three, minWidth: 0 },
  member: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    minWidth: 0,
    padding: Spacing.three,
  },
  field: { gap: Spacing.one, minWidth: 0 },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
