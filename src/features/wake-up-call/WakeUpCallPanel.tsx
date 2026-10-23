import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/features/auth/auth-context";
import { useGeneralAlarmNotifications } from "@/features/general-alarm/general-alarm-notifications-context";
import { useI18n } from "@/features/i18n/i18n";
import { useWakeUpCall } from "@/features/wake-up-call/wake-up-call-context";
import { useTheme } from "@/hooks/use-theme";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export function WakeUpCallPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const theme = useTheme();
  const { session } = useAuth();
  const { calls, recipients, isLoading, error, refresh, acknowledge } =
    useWakeUpCall();
  const notifications = useGeneralAlarmNotifications();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleCalls = calls.filter((call) =>
    recipients.some(
      (recipient) =>
        recipient.call_id === call.id &&
        recipient.user_id === session?.user.id &&
        (!compact || !recipient.acknowledged_at),
    ),
  );
  if (compact && visibleCalls.length === 0) return null;
  return (
    <Card style={styles.card}>
      <ThemedText type="heading">{t("wakeUp.title")}</ThemedText>
      {isLoading ? <ActivityIndicator color={theme.accent} /> : null}
      {error || actionError ? (
        <View style={styles.card}>
          <ThemedText themeColor="danger">{actionError ?? error}</ThemedText>
          <Button
            icon="refresh"
            label={t("tripGroups.retry")}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </View>
      ) : null}
      {visibleCalls.map((call) => {
        const own = recipients.find(
          (recipient) =>
            recipient.call_id === call.id &&
            recipient.user_id === session?.user.id,
        );
        return (
          <View key={call.id} style={styles.card}>
            <ThemedText>{call.message}</ThemedText>
            {own?.acknowledged_at ? (
              <ThemedText themeColor="success">
                {t("wakeUp.acknowledged")}
              </ThemedText>
            ) : (
              <Button
                disabled={working}
                icon="confirm"
                label={t("wakeUp.acknowledge")}
                onPress={() => {
                  setWorking(true);
                  setActionError(null);
                  void acknowledge(call.id)
                    .then((result) => setActionError(result.error))
                    .finally(() => setWorking(false));
                }}
              />
            )}
          </View>
        );
      })}
      {!isLoading && visibleCalls.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          {t("wakeUp.inactive")}
        </ThemedText>
      ) : null}
      {!compact ? (
        <>
          {!notifications.enabled ? (
            <Button
              icon="settings"
              disabled={notifications.isWorking}
              label={t("wakeUp.enableNotifications")}
              onPress={() => void notifications.enable()}
              variant="secondary"
            />
          ) : null}
          {notifications.availability !== "registered" ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t(`generalAlarm.notifications.${notifications.availability}`)}
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
const styles = StyleSheet.create({ card: { gap: Spacing.three } });
