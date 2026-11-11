import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SymbolIcon, type SymbolIconName } from '@/components/ui/symbol-icon';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AdminSectionHeaderProps = {
  description: string;
  icon: SymbolIconName;
  label?: string;
  onPress: () => void;
  status: string;
  statusColor?: ThemeColor;
  title: string;
};

export function AdminSectionHeader({
  description,
  icon,
  label,
  onPress,
  status,
  statusColor = 'textSecondary',
  title,
}: AdminSectionHeaderProps) {
  const theme = useTheme();
  const color = theme[statusColor];

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={`${title}, ${status}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.header,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
        <SymbolIcon color={theme.accent} name={icon} size={40} />
      </View>

      <ThemedText numberOfLines={2} style={styles.title}>{label ?? title}</ThemedText>

      <ThemedText numberOfLines={2} type="smallBold" style={[styles.statusText, { color }]}>
        {'● '}{status}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    justifyContent: 'center',
    minHeight: 172,
    padding: 10,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 22,
    textAlign: 'center',
  },
  statusText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    maxWidth: '100%',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
