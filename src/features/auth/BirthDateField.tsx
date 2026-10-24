import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatBirthDateInput } from '@/features/auth/birth-date';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

export function BirthDateField({
  accessibilityLabel,
  disabled,
  onChange,
  value,
}: {
  accessibilityLabel?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const { isRTL, t } = useI18n();
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{t('auth.birthDate')}</ThemedText>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? t('auth.birthDate')}
        accessibilityHint={t('auth.familyMembers.birthDateHint')}
        autoComplete="off"
        editable={!disabled}
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={10}
        onChangeText={text => onChange(formatBirthDateInput(text))}
        placeholder={t('auth.familyMembers.birthDatePlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: 'ltr',
          },
        ]}
        value={value}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('auth.familyMembers.birthDateHint')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two, minWidth: 0 },
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
