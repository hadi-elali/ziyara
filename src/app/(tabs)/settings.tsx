import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Switch, View } from "react-native";

import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  getAuthErrorTranslationKey,
  useAuth,
} from "@/features/auth/auth-context";
import { useGeneralAlarmNotifications } from "@/features/general-alarm/general-alarm-notifications-context";
import { languageOptions, useI18n } from "@/features/i18n/i18n";
import { ReaderPreferenceControls } from "@/features/reader/ReaderPreferenceControls";
import {
  busRoute,
  emergencyDashboardRoute,
  loginRoute,
} from "@/features/navigation/routes";
import { useThemeMode, type ThemeMode } from "@/features/theme/theme-mode";
import { useTheme } from "@/hooks/use-theme";

const themeModeOptions: ThemeMode[] = ["system", "light", "dark"];

export default function SettingsScreen() {
  const theme = useTheme();
  const { mode, resolvedTheme, setMode } = useThemeMode();
  const { language, setLanguage, t } = useI18n();
  const { isAdmin, profile, signOut, user } = useAuth();
  const notifications = useGeneralAlarmNotifications();

  const handleSignOut = async () => {
    await notifications.unregisterDevice();
    const { error } = await signOut();

    if (error) {
      Alert.alert(t("auth.errorTitle"), t(getAuthErrorTranslationKey(error)));
    }
  };

  return (
    <Screen>
      <Section title={t("settings.appearance")}>
        <ThemedView
          type="surface"
          style={[styles.panel, { borderColor: theme.border }]}
        >
          <View style={styles.rowText}>
            <ThemedText type="smallBold">{t("settings.themeTitle")}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t("settings.themeBody")}
            </ThemedText>
          </View>

          <View accessibilityRole="radiogroup" style={styles.segmentedControl}>
            {themeModeOptions.map((option) => {
              const selected = mode === option;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option}
                  onPress={() => setMode(option)}
                  style={({ pressed }) => [
                    styles.segment,
                    {
                      backgroundColor: selected
                        ? theme.accent
                        : theme.backgroundElement,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={selected && { color: theme.background }}
                  >
                    {t(`settings.theme.${option}`)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t("settings.activeMode", {
              mode:
                resolvedTheme === "dark"
                  ? t("settings.darkBlue")
                  : t("settings.light"),
            })}
          </ThemedText>
        </ThemedView>
      </Section>

      <Section title={t("settings.languageTitle")}>
        <ThemedView
          type="surface"
          style={[styles.panel, { borderColor: theme.border }]}
        >
          <View style={styles.rowText}>
            <ThemedText type="smallBold">
              {t("settings.languageTitle")}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t("settings.languageBody")}
            </ThemedText>
          </View>

          <View accessibilityRole="radiogroup" style={styles.segmentedControl}>
            {languageOptions.map((option) => {
              const selected = language === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => setLanguage(option.value)}
                  style={({ pressed }) => [
                    styles.segment,
                    {
                      backgroundColor: selected
                        ? theme.accent
                        : theme.backgroundElement,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={selected && { color: theme.background }}
                  >
                    {option.nativeLabel}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </ThemedView>
      </Section>

      <Section title={t("settings.notifications")}>
        <ThemedView
          type="surface"
          style={[styles.panel, { borderColor: theme.border }]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">
                {t("settings.notificationsTitle")}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user
                  ? t("settings.notificationsBody")
                  : t("settings.notificationsGuestBody")}
              </ThemedText>
            </View>
            <Switch
              accessibilityHint={t("settings.notificationsHint")}
              accessibilityLabel={t("settings.notificationsTitle")}
              disabled={
                !user ||
                notifications.isWorking ||
                notifications.availability === "checking" ||
                notifications.availability === "expo_go" ||
                notifications.availability === "unsupported"
              }
              ios_backgroundColor={theme.border}
              onValueChange={(enabled) =>
                void (enabled
                  ? notifications.enable()
                  : notifications.disable())
              }
              thumbColor={
                notifications.enabled ? theme.accent : theme.textSecondary
              }
              trackColor={{
                false: theme.border,
                true: theme.accentSoft,
              }}
              value={notifications.enabled}
            />
          </View>
          {user ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t(`generalAlarm.notifications.${notifications.availability}`)}
            </ThemedText>
          ) : null}
          {user && notifications.availability === "denied" ? (
            <Button
              icon="settings"
              label={t("settings.notificationsOpenSettings")}
              onPress={() => void notifications.openSettings()}
              variant="secondary"
            />
          ) : null}
        </ThemedView>
      </Section>

      <Section title={t("settings.reader")}>
        <ReaderPreferenceControls />
      </Section>

      <Section title={t("settings.account")}>
        <ThemedView
          type="surface"
          style={[styles.panel, { borderColor: theme.border }]}
        >
          {user ? (
            <>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">
                  {t("settings.accountEmail")}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {user.email ?? "—"}
                </ThemedText>
              </View>
              <Button
                icon="account"
                label={t("settings.manageAccount")}
                variant="secondary"
                onPress={() => router.push("/account")}
              />
              <Button
                icon="bus"
                label={t("settings.openBusManagement")}
                variant="secondary"
                onPress={() => router.push(busRoute())}
              />
              {profile?.role === "admin" ||
              profile?.role === "medical_staff" ||
              profile?.role === "organization_team" ? (
                <Button
                  icon="alarm"
                  label={t("settings.openEmergencyDashboard")}
                  variant="secondary"
                  onPress={() => router.push(emergencyDashboardRoute())}
                />
              ) : null}
              <Button
                icon="logout"
                label={t("settings.signOut")}
                variant="secondary"
                onPress={() => void handleSignOut()}
              />
              {isAdmin ? (
                <Button
                  icon="people"
                  label={t("settings.openAdmin")}
                  onPress={() => router.push("/admin")}
                />
              ) : null}
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t("settings.accountGuestBody")}
              </ThemedText>
              <Button
                icon="account"
                label={t("settings.signIn")}
                onPress={() => router.push(loginRoute())}
              />
            </>
          )}
        </ThemedView>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    padding: Spacing.three,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.three,
    justifyContent: "space-between",
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
  },
  stepButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  actions: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  segmentedControl: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  segment: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 92,
    paddingHorizontal: Spacing.three,
  },
});
