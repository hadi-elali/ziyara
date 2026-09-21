import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { SymbolIcon, type SymbolIconName } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { AccountFamily, AdminUserSummary } from '@/domain/database';
import { AdminBusManagementPanel } from '@/features/bus-management/AdminBusManagementPanel';
import { useBusManagement } from '@/features/bus-management/bus-management-context';
import { AdminGeneralAlarmPanel } from '@/features/general-alarm/AdminGeneralAlarmPanel';
import { useI18n } from '@/features/i18n/i18n';
import { AdminTripGuidancePanel } from '@/features/trip-guidance/AdminTripGuidancePanel';
import { useTripGuidance } from '@/features/trip-guidance/trip-guidance-context';
import { AdminTripGroupPanel } from '@/features/trip-groups/AdminTripGroupPanel';
import { useTripGroups } from '@/features/trip-groups/trip-group-context';
import { useTheme } from '@/hooks/use-theme';

type TravelOrganizationArea = 'groups' | 'live' | 'setup';

type AdminTravelOrganizationPanelProps = {
  families: AccountFamily[];
  users: AdminUserSummary[];
};

const areas: {
  descriptionKey: string;
  icon: SymbolIconName;
  id: TravelOrganizationArea;
  labelKey: string;
  step: number;
}[] = [
  {
    descriptionKey: 'admin.organization.setup.description',
    icon: 'bus',
    id: 'setup',
    labelKey: 'admin.organization.setup.title',
    step: 1,
  },
  {
    descriptionKey: 'admin.organization.groups.description',
    icon: 'people',
    id: 'groups',
    labelKey: 'admin.organization.groups.title',
    step: 2,
  },
  {
    descriptionKey: 'admin.organization.live.description',
    icon: 'map',
    id: 'live',
    labelKey: 'admin.organization.live.title',
    step: 3,
  },
];

export function AdminTravelOrganizationPanel({
  families,
  users,
}: AdminTravelOrganizationPanelProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const { activeBoarding, activeTrip, buses, participants } = useBusManagement();
  const { groups } = useTripGroups();
  const { activeGuidance } = useTripGuidance();
  const [activeArea, setActiveArea] = useState<TravelOrganizationArea>('setup');

  return (
    <View style={styles.container}>
      <Card style={styles.overview}>
        <View style={styles.overviewHeading}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('admin.organization.overview.activeTrip')}
          </ThemedText>
          <ThemedText type="heading">
            {activeTrip?.name ?? t('admin.organization.overview.noActiveTrip')}
          </ThemedText>
        </View>

        <View style={styles.metrics}>
          <OrganizationMetric
            label={t('admin.organization.overview.buses')}
            value={String(buses.length)}
          />
          <OrganizationMetric
            label={t('admin.organization.overview.participants')}
            value={String(participants.length)}
          />
          <OrganizationMetric
            label={t('admin.organization.overview.groups')}
            value={String(groups.length)}
          />
          <OrganizationMetric
            label={t('admin.organization.overview.guidance')}
            value={t(
              activeGuidance
                ? 'admin.organization.overview.live'
                : 'admin.organization.overview.notPublished',
            )}
          />
          <OrganizationMetric
            label={t('admin.organization.overview.alarm')}
            value={t(
              activeBoarding
                ? 'admin.organization.overview.enabled'
                : 'admin.organization.overview.disabled',
            )}
          />
        </View>
      </Card>

      <View accessibilityRole="radiogroup" style={styles.areaTabs}>
        {areas.map((area) => {
          const selected = area.id === activeArea;
          const foreground = selected ? theme.background : theme.text;

          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={area.id}
              onPress={() => setActiveArea(area.id)}
              style={({ pressed }) => [
                styles.areaTab,
                {
                  backgroundColor: selected ? theme.accent : theme.surface,
                  borderColor: selected ? theme.accent : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.stepBadge,
                  {
                    backgroundColor: selected ? theme.background : theme.backgroundElement,
                    borderColor: selected ? theme.background : theme.border,
                  },
                ]}>
                <ThemedText
                  type="tinyBold"
                  style={{ color: selected ? theme.accent : theme.text }}>
                  {area.step}
                </ThemedText>
              </View>
              <View style={styles.areaTabText}>
                <View style={styles.areaTabTitle}>
                  <SymbolIcon color={foreground} name={area.icon} size={18} />
                  <ThemedText type="smallBold" style={{ color: foreground }}>
                    {t(area.labelKey)}
                  </ThemedText>
                </View>
                <ThemedText
                  type="small"
                  style={{ color: selected ? theme.background : theme.textSecondary }}>
                  {t(area.descriptionKey)}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.activePanel}>
        {activeArea === 'setup' ? (
          <AdminBusManagementPanel families={families} users={users} />
        ) : null}

        {activeArea === 'groups' ? <AdminTripGroupPanel /> : null}

        {activeArea === 'live' ? (
          <View style={styles.liveSections}>
            <OrganizationSubsection
              description={t('admin.section.guidance.description')}
              title={t('admin.section.guidance.title')}>
              <AdminTripGuidancePanel />
            </OrganizationSubsection>
            <OrganizationSubsection
              description={t('admin.section.alarm.description')}
              title={t('admin.section.alarm.title')}>
              <AdminGeneralAlarmPanel />
            </OrganizationSubsection>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OrganizationMetric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function OrganizationSubsection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.subsection, { borderColor: theme.border }]}>
      <View style={styles.subsectionHeading}>
        <ThemedText type="heading">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  overview: {
    borderRadius: 12,
    gap: Spacing.three,
  },
  overviewHeading: {
    gap: Spacing.one,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metric: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexGrow: 1,
    gap: Spacing.one,
    minWidth: 120,
    padding: Spacing.two,
  },
  areaTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  areaTab: {
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: 190,
    flexDirection: 'row',
    flexGrow: 1,
    gap: Spacing.two,
    minHeight: 88,
    padding: Spacing.three,
  },
  stepBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  areaTabText: {
    flex: 1,
    gap: Spacing.one,
    minWidth: 0,
  },
  areaTabTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  activePanel: {
    gap: Spacing.three,
  },
  liveSections: {
    gap: Spacing.four,
  },
  subsection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  subsectionHeading: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.72,
  },
});
