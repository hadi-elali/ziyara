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

export type ButtonVariant = 'danger' | 'danger-solid' | 'success' | 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  icon: SymbolIconName;
  iconSize?: number;
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
  iconSize,
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
  const isDanger = variant === 'danger' || variant === 'danger-solid';
  const isSuccess = variant === 'success';
  const isSolid = isPrimary || isSuccess || variant === 'danger-solid';
  const isCompact = size === 'compact';
  const foreground = isSolid
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
            : isSuccess
              ? theme.success
              : variant === 'danger-solid'
                ? theme.danger
                : isGhost
                  ? 'transparent'
                  : isDanger
                    ? theme.dangerSoft
                    : theme.backgroundElement,
          borderColor: isGhost
            ? 'transparent'
            : isPrimary
              ? theme.accent
              : isSuccess
                ? theme.success
                : isDanger
                  ? theme.danger
                  : theme.border,
        },
        isCompact && styles.compact,
        style,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolIcon color={foreground} name={icon} size={iconSize ?? (isCompact ? 15 : 18)} />
      <ThemedText
        type="smallBold"
        style={[
          (isSuccess || variant === 'danger-solid') && styles.label,
          { color: foreground },
          isCompact && styles.compactLabel,
        ]}>
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
  label: {
    flexShrink: 1,
    textAlign: 'center',
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
