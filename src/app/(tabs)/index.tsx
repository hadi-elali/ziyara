import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { allPlaces } from "@/data/places";
import type { Place } from "@/domain/types";
import { useAuth } from "@/features/auth/auth-context";
import { useBusManagement } from "@/features/bus-management/bus-management-context";
import { DailyProgramHome } from "@/features/daily-program/DailyProgramHome";
import { useI18n } from "@/features/i18n/i18n";
import { useGroupCheck } from "@/features/group-check/group-check-context";
import { localizeCityName, localizePlace } from "@/features/i18n/localizedData";
import {
  busRoute,
  cityRoute,
  groupRoute,
  guideRoute,
} from "@/features/navigation/routes";
import { PlaceImageCard } from "@/features/places/PlaceImageCard";
import { useQuestionRound } from "@/features/question-round/question-round-context";
import { useTheme } from "@/hooks/use-theme";
import { useTripGuidance } from "@/features/trip-guidance/trip-guidance-context";
import { useTripGroups } from "@/features/trip-groups/trip-group-context";

const featuredSlugs = [
  "shrine-imam-hussain",
  "shrine-imam-ali",
  "masjid-al-kufa",
  "shrine-kadhimayn",
];

function isPlace(place: Place | undefined): place is Place {
  return Boolean(place);
}

export default function HomeScreen() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { profile, session } = useAuth();
  const { activeBoarding, participants: busParticipants } = useBusManagement();
  const { activeCheck, currentResponse } = useGroupCheck();
  const { groups: tripGroups } = useTripGroups();
  const {
    activeRound,
    hasSyncError: hasQuestionRoundSyncError,
    refresh: refreshQuestionRound,
    syncErrorMessage: questionRoundSyncErrorMessage,
  } = useQuestionRound();
  const { activeGuidance, participants: guidanceParticipants } =
    useTripGuidance();
  const ownTripGroups = tripGroups.filter(
    (group) => group.is_current_user_member,
  );
  const hasPendingLeaderLocationRequest = ownTripGroups.some(
    (group) =>
      group.is_current_user_leader &&
      group.location_request?.status === "pending",
  );
  const featuredPlaces = featuredSlugs
    .map((slug) => allPlaces.find((place) => place.slug === slug))
    .filter(isPlace)
    .map((place) => localizePlace(place, language));
  const cities = ["Karbala", "Najaf", "Kufa", "Kadhimayn", "Samarra"];


  return (
    <Screen>
      {session ? (
        <View
          style={[
            styles.hero,
            {
              backgroundColor: "#618764",
              flex: 1,
            },
          ]}
        >
          <DailyProgramHome />
        </View>
      ) : null}

      {session && activeCheck ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.warningSoft, borderColor: theme.warning },
          ]}
        >
          <ThemedText type="heading">{t("groupCheck.homeTitle")}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t("groupCheck.homeBody")}
          </ThemedText>
          <Button
            icon="confirm"
            label={t(
              currentResponse === null
                ? "groupCheck.openForm"
                : "groupCheck.changeAnswer",
            )}
            onPress={() => router.push("/check-in")}
          />
        </View>
      ) : null}

      {session && activeBoarding && busParticipants.length > 0 ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
        >
          <ThemedText type="heading">{t("bus.homeTitle")}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t("bus.homeBody", { count: busParticipants.length })}
          </ThemedText>
          <Button
            icon="bus"
            label={t("bus.open")}
            onPress={() => router.push(busRoute())}
          />
        </View>
      ) : null}

      {session && ownTripGroups.length > 0 ? (
        <View
          style={[
            styles.notice,
            hasPendingLeaderLocationRequest
              ? {
                  backgroundColor: theme.warningSoft,
                  borderColor: theme.warning,
                }
              : {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
          ]}
        >
          <ThemedText type="heading">
            {t(
              hasPendingLeaderLocationRequest
                ? "tripGroups.homeRequestTitle"
                : "tripGroups.homeTitle",
            )}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {t(
              hasPendingLeaderLocationRequest
                ? "tripGroups.homeRequestBody"
                : "tripGroups.homeBody",
              { count: ownTripGroups.length },
            )}
          </ThemedText>
          <Button
            icon="people"
            label={t("tripGroups.open")}
            onPress={() => router.push(groupRoute())}
          />
        </View>
      ) : null}

      {session &&
      profile !== null &&
      profile.role !== "admin" &&
      activeGuidance &&
      guidanceParticipants.length > 0 ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.successSoft, borderColor: theme.success },
          ]}
        >
          <ThemedText type="heading">{t("guide.homeTitle")}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t("guide.homeBody", { place: activeGuidance.current_place_name })}
          </ThemedText>
          <Button
            icon="map"
            label={t("guide.open")}
            onPress={() => router.push(guideRoute())}
          />
        </View>
      ) : null}

      {session && activeRound ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
        >
          <ThemedText type="heading">{t("questionRound.homeTitle")}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t("questionRound.homeBody")}
          </ThemedText>
          <Button
            icon="question"
            label={t("questionRound.openForm")}
            onPress={() => router.push("/question-round")}
          />
        </View>
      ) : null}

      {session && hasQuestionRoundSyncError && !activeRound ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.warningSoft, borderColor: theme.warning },
          ]}
        >
          <ThemedText type="heading">
            {t("questionRound.syncErrorTitle")}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {questionRoundSyncErrorMessage}
          </ThemedText>
          <Button
            icon="refresh"
            label={t("groupCheck.retry")}
            onPress={() => void refreshQuestionRound()}
            variant="secondary"
          />
        </View>
      ) : null}

      <Section title={t("home.importantCities")}>
        <ScrollView
          style={styles.cityGrid}
          contentContainerStyle={{ gap: Spacing.two }}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {cities.map((city) => (
            <Pressable
              accessibilityRole="button"
              key={city}
              onPress={() => router.push(cityRoute(city))}
              style={({ pressed }) => [
                styles.cityPill,
                {
                  backgroundColor: theme.accent,
                  borderColor: theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {localizeCityName(city, language)}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Section title={t("home.featuredPlaces")}>
        <View style={styles.list}>
          {featuredPlaces.map((place) => (
            <PlaceImageCard key={place.id} place={place} />
          ))}
        </View>
      </Section>

    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    gap: Spacing.four,
    padding: Spacing.four,
    borderWidth: 0.2,
  },
  heroText: {
    gap: Spacing.two,
  },
  title: {
    maxWidth: 640,
  },
  actions: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.two,
  },
  cityGrid: {
    flexDirection: "row",
  },
  cityPill: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  notice: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.72,
  },
});
