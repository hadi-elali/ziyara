import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/features/i18n/i18n';
import { useTheme } from '@/hooks/use-theme';

type PasswordInputProps = Pick<
  TextInputProps,
  'autoComplete' | 'editable' | 'onChangeText' | 'onSubmitEditing' | 'textContentType' | 'value'
> & {
  accessibilityLabel: string;
};

export function PasswordInput({
  accessibilityLabel,
  editable = true,
  ...inputProps
}: PasswordInputProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}>
      <TextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        placeholder="••••••••"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry={!isVisible}
        style={[styles.input, { color: theme.text }]}
      />
      <Pressable
        accessibilityLabel={`${accessibilityLabel}: ${t(isVisible ? 'auth.hidePassword' : 'auth.showPassword')}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !editable }}
        disabled={!editable}
        onPress={() => setIsVisible((visible) => !visible)}
        style={({ pressed }) => [
          styles.toggle,
          pressed && styles.pressed,
          !editable && styles.disabled,
        ]}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolIcon
            color={theme.textSecondary}
            name={isVisible ? 'eye-off' : 'eye'}
            size={22}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minWidth: 0,
  },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  toggle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: 48,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.6,
  },
});
