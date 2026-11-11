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
        <SymbolIcon color={theme.accent} name={icon} size={28} />
      </View>

      <ThemedText numberOfLines={2} style={styles.title}>{label ?? title}</ThemedText>

      <View style={styles.status}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <ThemedText numberOfLines={1} type="tinyBold" style={[styles.statusText, { color }]}>
          {status}
        </ThemedText>
      </View>
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
    padding: 12,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 18,
    textAlign: 'center',
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
    maxWidth: '100%',
  },
  statusDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  statusText: {
    flexShrink: 1,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
