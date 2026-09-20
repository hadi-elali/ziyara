import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { Spacing } from "@/constants/theme";
import type {
  EmergencyInboxMessage,
  EmergencyRequest,
  EmergencyTeam,
} from "@/domain/database";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/features/auth/supabase";
import { useGeneralAlarmNotifications } from "@/features/general-alarm/general-alarm-notifications-context";
import { useI18n } from "@/features/i18n/i18n";
import {
  getOriginalErrorMessage,
  withSupabaseReadTimeout,
} from "@/features/network/supabase-read";
import { openNavigation } from "@/features/places/openNavigation";
import { useTheme } from "@/hooks/use-theme";

type Coordinates = {
  accuracy: number | null;
  latitude: number;
  longitude: number;
};

type LocationFeedback = "denied" | "error" | "ready" | null;
type SubmitFeedback =
  | {
      kind:
        | "validation_location"
        | "validation_message"
        | "validation_team";
    }
  | { kind: "error"; message: string }
  | { kind: "no_recipients" }
  | { count: number; kind: "success" | "success_no_push" }
  | null;

const requestSelect =
  "id, requester_profile_id, requester_display_name, target_team, message, location_label, latitude, longitude, accuracy_meters, created_at";
const pushDispatchTimeoutMs = 8_000;

async function dispatchEmergencyPush(requestId: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = new Promise<null>((resolve) => {
    timeout = setTimeout(() => resolve(null), pushDispatchTimeoutMs);
  });

  try {
    return await Promise.race([
      supabase.functions.invoke<{ accepted?: number; claimed?: number }>(
        "dispatch-emergency-alert",
        { body: { requestId } },
      ),
      timeoutResult,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default function EmergencyScreen() {
  return (
    <RequireAuth returnTo="/emergency">
      <EmergencyContent />
    </RequireAuth>
  );
}

function EmergencyContent() {
  const theme = useTheme();
  const { isRTL, language, t } = useI18n();
  const { profile, session } = useAuth();
  const notifications = useGeneralAlarmNotifications();
  const [team, setTeam] = useState<EmergencyTeam | null>(null);
  const [message, setMessage] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationFeedback, setLocationFeedback] =
    useState<LocationFeedback>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<SubmitFeedback>(null);
  const [inbox, setInbox] = useState<EmergencyInboxMessage[]>([]);
  const [sent, setSent] = useState<EmergencyRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<number | null>(null);
  const [markReadError, setMarkReadError] = useState<{
    message: string;
    requestId: number;
  } | null>(null);
  const refreshVersion = useRef(0);
  const loadedUserId = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  const profileId = profile?.id ?? null;
  const isStaff =
    profile?.role === "medical_staff" || profile?.role === "organization_team";

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    if (!userId || !profileId) {
      setInbox([]);
      setSent([]);
      loadedUserId.current = null;
      setIsLoading(false);
      setSyncErrorMessage(null);
      return;
    }

    if (loadedUserId.current !== userId) {
      setInbox([]);
      setSent([]);
      setIsLoading(true);
    }
    setIsRefreshing(true);
    try {
      const [inboxResult, sentResult] = await Promise.all([
        withSupabaseReadTimeout((signal) =>
          supabase.rpc("list_my_emergency_messages").abortSignal(signal),
        ),
        withSupabaseReadTimeout((signal) =>
          supabase
            .from("emergency_requests")
            .select(requestSelect)
            .eq("requester_profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(50)
            .abortSignal(signal),
        ),
      ]);

      if (inboxResult.error) throw inboxResult.error;
      if (sentResult.error) throw sentResult.error;

      if (version === refreshVersion.current) {
        setInbox(inboxResult.data ?? []);
        setSent(sentResult.data ?? []);
        loadedUserId.current = userId;
        setSyncErrorMessage(null);
      }
    } catch (error) {
      if (version === refreshVersion.current) {
        setSyncErrorMessage(getOriginalErrorMessage(error));
      }
    } finally {
      if (version === refreshVersion.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [profileId, userId]);

  useEffect(() => {
    const initialRefreshTimeout = setTimeout(() => void refresh(), 0);
    if (!userId) return () => clearTimeout(initialRefreshTimeout);

    const channel = supabase
      .channel(`emergency-messages:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergency_requests" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emergency_request_recipients" },
        () => void refresh(),
      )
      .subscribe();

    const appStateSubscription =
      Platform.OS === "web"
        ? null
        : AppState.addEventListener("change", (state) => {
            if (state === "active") void refresh();
          });

    return () => {
      clearTimeout(initialRefreshTimeout);
      refreshVersion.current += 1;
      appStateSubscription?.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const captureCurrentLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    setLocationFeedback(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationFeedback("denied");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoordinates({
        accuracy: position.coords.accuracy,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationFeedback("ready");
    } catch {
      setLocationFeedback("error");
    } finally {
      setIsLocating(false);
    }
  };

  const submit = async () => {
    if (isSubmitting) return;
    const normalizedLocationLabel = locationLabel.trim();
    const normalizedMessage = message.trim();
    if (!team) {
      setSubmitFeedback({ kind: "validation_team" });
      return;
    }
    if (!normalizedLocationLabel) {
      setSubmitFeedback({ kind: "validation_location" });
      return;
    }
    if (normalizedMessage.length < 5) {
      setSubmitFeedback({ kind: "validation_message" });
      return;
    }

    Keyboard.dismiss();
    setSubmitFeedback(null);
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.rpc("submit_emergency_request", {
        p_accuracy_meters: coordinates?.accuracy ?? null,
        p_latitude: coordinates?.latitude ?? null,
        p_location_label: normalizedLocationLabel,
        p_longitude: coordinates?.longitude ?? null,
        p_message: normalizedMessage,
        p_target_team: team,
      });
      if (error || !data?.[0])
        throw error ?? new Error("Missing emergency request result.");

      const result = data[0];
      let pushAccepted = false;
      let pushErrorMessage: string | null = null;
      if (result.recipient_count > 0) {
        try {
          const dispatch = await dispatchEmergencyPush(result.request_id);
          pushErrorMessage = dispatch?.error?.message ?? null;
          pushAccepted = Boolean(
            dispatch && !dispatch.error && (dispatch.data?.accepted ?? 0) > 0,
          );
        } catch (error) {
          // The durable inbox message is already stored. Push remains best effort.
          pushErrorMessage = getOriginalErrorMessage(error);
          pushAccepted = false;
        }
      }

      setMessage("");
      setLocationLabel("");
      setCoordinates(null);
      setLocationFeedback(null);
      setTeam(null);
      setSubmitFeedback(
        pushErrorMessage
          ? { kind: "error", message: pushErrorMessage }
          : result.recipient_count === 0
          ? { kind: "no_recipients" }
          : {
              count: result.recipient_count,
              kind: pushAccepted ? "success" : "success_no_push",
            },
      );
      await refresh();
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setSubmitFeedback({ kind: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const markRead = async (requestId: number) => {
    if (markingReadId !== null) return;
    setMarkingReadId(requestId);
    setMarkReadError(null);
    try {
      const { error } = await supabase.rpc("mark_emergency_request_read", {
        p_request_id: requestId,
      });
      if (error) throw error;

      setInbox((current) =>
        current.map((item) =>
          item.request_id === requestId
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setMarkReadError({ message, requestId });
    } finally {
      setMarkingReadId(null);
    }
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));

  const openCoordinates = (
    item: Pick<EmergencyRequest, "latitude" | "longitude" | "location_label">,
  ) => {
    if (item.latitude === null || item.longitude === null) return;
    void openNavigation({
      latitude: item.latitude,
      longitude: item.longitude,
      name: item.location_label ?? t("emergency.locationFallback"),
    });
  };

  return (
    <Screen safeAreaEdges={["right", "bottom", "left"]}>
      <View style={styles.intro}>
        <ThemedText type="title">{t("emergency.title")}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {t("emergency.body")}
        </ThemedText>
      </View>

      <Section title={t("emergency.formTitle")}>
        <Card style={styles.formCard}>
          <View style={styles.field}>
            <ThemedText type="smallBold">{t("emergency.teamLabel")}</ThemedText>
            <View style={styles.teamChoices}>
              {(["medical", "travel"] as const).map((value) => {
                const selected = team === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => {
                      setTeam(value);
                      setSubmitFeedback(null);
                    }}
                    style={({ pressed }) => [
                      styles.teamChoice,
                      {
                        backgroundColor: selected
                          ? theme.dangerSoft
                          : theme.background,
                        borderColor: selected ? theme.danger : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText
                      type="heading"
                      themeColor={selected ? "danger" : "text"}
                    >
                      {t(`emergency.team.${value}`)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(`emergency.team.${value}Body`)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">
              {t("emergency.locationLabel")}
            </ThemedText>
            <TextInput
              accessibilityLabel={t("emergency.locationLabel")}
              editable={!isSubmitting}
              maxLength={300}
              onChangeText={(value) => {
                setLocationLabel(value);
                setSubmitFeedback(null);
              }}
              placeholder={t("emergency.locationPlaceholder")}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  borderColor:
                    submitFeedback?.kind === "validation_location"
                      ? theme.danger
                      : theme.border,
                  color: theme.text,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
              value={locationLabel}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t("emergency.locationPrivacy")}
            </ThemedText>
            <View style={styles.inlineActions}>
              <Button
                disabled={isLocating || isSubmitting}
                icon="location"
                label={
                  isLocating
                    ? t("emergency.locationSharing")
                    : t("emergency.locationShare")
                }
                onPress={() => void captureCurrentLocation()}
                variant="secondary"
              />
              {coordinates ? (
                <Button
                  disabled={isSubmitting}
                  icon="close"
                  label={t("emergency.locationClear")}
                  onPress={() => {
                    setCoordinates(null);
                    setLocationFeedback(null);
                  }}
                  variant="ghost"
                />
              ) : null}
            </View>
            {coordinates ? (
              <ThemedText type="code" themeColor="success">
                {coordinates.latitude.toFixed(5)},{" "}
                {coordinates.longitude.toFixed(5)}
                {coordinates.accuracy !== null
                  ? ` · ±${Math.round(coordinates.accuracy)} m`
                  : ""}
              </ThemedText>
            ) : null}
            {locationFeedback === "denied" || locationFeedback === "error" ? (
              <ThemedText
                type="small"
                themeColor="danger"
                accessibilityLiveRegion="polite"
              >
                {t(
                  locationFeedback === "denied"
                    ? "emergency.locationDenied"
                    : "emergency.locationError",
                )}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold">
              {t("emergency.messageLabel")}
            </ThemedText>
            <TextInput
              accessibilityLabel={t("emergency.messageLabel")}
              editable={!isSubmitting}
              maxLength={1200}
              multiline
              onChangeText={(value) => {
                setMessage(value);
                setSubmitFeedback(null);
              }}
              placeholder={t("emergency.messagePlaceholder")}
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                styles.messageInput,
                {
                  backgroundColor: theme.background,
                  borderColor:
                    submitFeedback?.kind === "validation_message"
                      ? theme.danger
                      : theme.border,
                  color: theme.text,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
              textAlignVertical="top"
              value={message}
            />
            <ThemedText
              style={styles.characterCount}
              type="small"
              themeColor="textSecondary"
            >
              {message.length}/1200
            </ThemedText>
          </View>

          {submitFeedback ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={[
                styles.feedback,
                {
                  backgroundColor:
                    submitFeedback.kind === "success"
                      ? theme.successSoft
                      : theme.warningSoft,
                  borderColor:
                    submitFeedback.kind === "success"
                      ? theme.success
                      : theme.warning,
                },
              ]}
            >
              <ThemedText
                type="small"
                themeColor={
                  submitFeedback.kind === "success"
                    ? "success"
                    : submitFeedback.kind === "error" ||
                        submitFeedback.kind.startsWith("validation")
                      ? "danger"
                      : "warning"
                }
              >
                {submitFeedback.kind === "error"
                  ? submitFeedback.message
                  : t(
                      `emergency.feedback.${submitFeedback.kind}`,
                      "count" in submitFeedback
                        ? { count: submitFeedback.count }
                        : undefined,
                    )}
              </ThemedText>
            </View>
          ) : null}

          <Button
            disabled={isSubmitting}
            icon="warning"
            label={
              isSubmitting ? t("emergency.submitting") : t("emergency.submit")
            }
            onPress={() => void submit()}
            variant="danger"
          />
          {isSubmitting ? <ActivityIndicator color={theme.danger} /> : null}
        </Card>
      </Section>

      {isStaff ? (
        <Section title={t("emergency.notificationsTitle")}>
          <Card style={styles.notificationCard}>
            <ThemedText type="small" themeColor="textSecondary">
              {notifications.errorMessage ??
                t(`emergency.notifications.${notifications.availability}`)}
            </ThemedText>
            {notifications.availability === "checking" ||
            notifications.isWorking ? (
              <ActivityIndicator color={theme.accent} />
            ) : notifications.availability === "disabled" ||
              notifications.availability === "denied" ||
              notifications.availability === "error" ? (
              <View style={styles.inlineActions}>
                <Button
                  icon="warning"
                  label={t("emergency.notificationsEnable")}
                  onPress={() => void notifications.enable()}
                />
                <Button
                  icon="settings"
                  label={t("emergency.notificationsSettings")}
                  onPress={() => void notifications.openSettings()}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {syncErrorMessage ? (
        <Card
          style={[
            styles.feedback,
            { backgroundColor: theme.warningSoft, borderColor: theme.warning },
          ]}
        >
          <ThemedText type="heading">
            {t("emergency.syncErrorTitle")}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {syncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t("emergency.retry")}
            onPress={() => void refresh()}
            variant="secondary"
          />
        </Card>
      ) : null}

      {isStaff ? (
        <Section title={t("emergency.inboxTitle")}>
          {isLoading ? (
            <ActivityIndicator color={theme.accent} size="large" />
          ) : inbox.length === 0 ? (
            <Card>
              <ThemedText type="heading">
                {t("emergency.inboxEmpty")}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t("emergency.inboxBody")}
              </ThemedText>
            </Card>
          ) : (
            <View style={styles.list}>
              {inbox.map((item) => (
                <EmergencyMessageCard
                  date={formatDate(item.created_at)}
                  item={item}
                  key={item.request_id}
                  markReadError={
                    markReadError?.requestId === item.request_id
                      ? markReadError.message
                      : null
                  }
                  markingRead={markingReadId === item.request_id}
                  onMarkRead={() => void markRead(item.request_id)}
                  onOpenCoordinates={() => openCoordinates(item)}
                />
              ))}
            </View>
          )}
        </Section>
      ) : null}

      <Section title={t("emergency.sentTitle")}>
        {isLoading ? (
          <ActivityIndicator color={theme.accent} size="large" />
        ) : sent.length === 0 ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {t("emergency.sentEmpty")}
            </ThemedText>
          </Card>
        ) : (
          <View style={styles.list}>
            {sent.map((item) => (
              <EmergencyMessageCard
                date={formatDate(item.created_at)}
                item={{ ...item, read_at: null, request_id: item.id }}
                key={item.id}
                onOpenCoordinates={() => openCoordinates(item)}
                sent
              />
            ))}
          </View>
        )}
      </Section>

      {isRefreshing ? <ActivityIndicator color={theme.accent} /> : null}
    </Screen>
  );
}

function EmergencyMessageCard({
  date,
  item,
  markReadError = null,
  markingRead = false,
  onMarkRead,
  onOpenCoordinates,
  sent = false,
}: {
  date: string;
  item: EmergencyInboxMessage;
  markReadError?: string | null;
  markingRead?: boolean;
  onMarkRead?: () => void;
  onOpenCoordinates: () => void;
  sent?: boolean;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const unread = !sent && item.read_at === null;

  return (
    <Card
      style={[
        styles.messageCard,
        unread
          ? { backgroundColor: theme.dangerSoft, borderColor: theme.danger }
          : null,
      ]}
    >
      <View style={styles.messageHeader}>
        <View style={styles.messageHeading}>
          <ThemedText type="heading">
            {sent
              ? t(`emergency.team.${item.target_team}`)
              : item.requester_display_name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {date}
          </ThemedText>
        </View>
        {unread ? (
          <View style={[styles.newBadge, { backgroundColor: theme.danger }]}>
            <ThemedText style={{ color: theme.surface }} type="tinyBold">
              {t("emergency.new")}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {!sent ? (
        <ThemedText type="tinyBold" themeColor="danger">
          {t(`emergency.team.${item.target_team}`)}
        </ThemedText>
      ) : null}
      <ThemedText>{item.message}</ThemedText>

      {item.location_label ? (
        <ThemedText type="small">
          {t("emergency.locationPrefix", { location: item.location_label })}
        </ThemedText>
      ) : null}
      {item.latitude !== null && item.longitude !== null ? (
        <View style={styles.coordinatesRow}>
          <ThemedText
            type="code"
            themeColor="textSecondary"
            style={styles.coordinatesText}
          >
            {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
            {item.accuracy_meters !== null
              ? ` · ±${Math.round(item.accuracy_meters)} m`
              : ""}
          </ThemedText>
          <Button
            icon="map"
            label={t("emergency.locationOpen")}
            onPress={onOpenCoordinates}
            variant="secondary"
          />
        </View>
      ) : null}

      {unread && onMarkRead ? (
        <Button
          disabled={markingRead}
          icon="confirm"
          label={t("emergency.markRead")}
          onPress={onMarkRead}
          variant="secondary"
        />
      ) : null}
      {!unread && !sent ? (
        <ThemedText type="small" themeColor="success">
          {t("emergency.read")}
        </ThemedText>
      ) : null}
      {markReadError ? (
        <ThemedText
          type="small"
          themeColor="danger"
          accessibilityLiveRegion="polite"
        >
          {markReadError}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  characterCount: { textAlign: "right", writingDirection: "ltr" },
  coordinatesRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  coordinatesText: { flex: 1, minWidth: 180 },
  feedback: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  field: { gap: Spacing.two },
  formCard: { gap: Spacing.four },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    padding: Spacing.three,
  },
  intro: { gap: Spacing.two },
  list: { gap: Spacing.three },
  messageCard: { gap: Spacing.three },
  messageHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
  },
  messageHeading: { flex: 1, gap: Spacing.one },
  messageInput: { minHeight: 150 },
  newBadge: {
    borderRadius: 8,
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  notificationCard: { gap: Spacing.three },
  pressed: { opacity: 0.72 },
  safetyCard: { gap: Spacing.two },
  teamChoice: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: Spacing.one,
    minWidth: 220,
    padding: Spacing.three,
  },
  teamChoices: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
});
