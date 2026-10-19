import {
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SymbolIcon, type SymbolIconName } from '@/components/ui/symbol-icon';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useResolvedTheme } from '@/features/theme/theme-mode';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'danger' | 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  icon: SymbolIconName;
  label: string;
  onPress: () => void;
  size?: 'default' | 'compact';
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function Button({
  accessibilityState,
  disabled = false,
  icon,
  label,
  onPress,
  size = 'default',
  style,
  variant = 'primary',
}: ButtonProps) {
  const theme = useTheme();
  const resolvedTheme = useResolvedTheme();
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';
  const isCompact = size === 'compact';
  const foreground = isPrimary
    ? resolvedTheme === 'dark'
      ? Colors.dark.background
      : Colors.dark.text
    : isDanger
      ? theme.danger
      : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary
            ? theme.accent
            : isGhost
              ? 'transparent'
              : isDanger
                ? theme.dangerSoft
                : theme.backgroundElement,
          borderColor: isGhost
            ? 'transparent'
            : isPrimary
              ? theme.accent
              : isDanger
                ? theme.danger
                : theme.border,
        },
        isCompact && styles.compact,
        style,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolIcon color={foreground} name={icon} size={isCompact ? 15 : 18} />
      <ThemedText type="smallBold" style={[{ color: foreground }, isCompact && styles.compactLabel]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  compact: {
    alignSelf: 'flex-start',
    gap: Spacing.one,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  compactLabel: { fontSize: 13, lineHeight: 18, fontWeight: 600 },
  disabled: {
    opacity: 0.55,
  },
});
