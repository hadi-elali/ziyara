import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { getPlacesByCity } from "@/data/places";
import type { Place } from "@/domain/types";
import { useI18n } from "@/features/i18n/i18n";
import { localizeCityName, localizePlaces } from "@/features/i18n/localizedData";
import { singleRouteParam } from "@/features/navigation/routes";
import { CityLocationMap } from "@/features/places/CityLocationMap";
import { PlaceImageCard } from "@/features/places/PlaceImageCard";

const cityDescriptionKeys: Record<string, string> = {
  Karbala: "city.description.Karbala",
  Najaf: "city.description.Najaf",
  Kadhimayn: "city.description.Kadhimayn",
  Kufa: "city.description.Kufa",
  Samarra: "city.description.Samarra",
  Balad: "city.description.Balad",
};

function getCityRegion(places: Place[]) {
  if (places.length === 0) {
    return null;
  }

  const anchorPlace = places[0];

  return {
    latitude: anchorPlace.latitude,
    longitude: anchorPlace.longitude,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  };
}

export default function CityScreen() {
  const params = useLocalSearchParams<{ city?: string | string[] }>();
  const city = singleRouteParam(params.city);
  const { language, t } = useI18n();
  const places = localizePlaces(getPlacesByCity(city), language);
  const title = city ? localizeCityName(city, language) : t("city.titleFallback");
  const cityRegion = getCityRegion(places);
  const cityDescription = t(
    city ? (cityDescriptionKeys[city] ?? "city.offlineBody") : "city.offlineBody",
  );

  return (
    <Screen
      contentStyle={styles.screenContent}
      safeAreaEdges={["right", "bottom", "left"]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="eyebrow" themeColor="accent">
            {t("nav.city")}
          </ThemedText>
          <ThemedText type="title">{title}</ThemedText>
          {cityRegion ? (
            <CityLocationMap
              city={title}
              placeCount={places.length}
              region={cityRegion}
            />
          ) : null}
          <ThemedText themeColor="textSecondary" style={{marginTop: 5}}>
            {cityDescription}
          </ThemedText>
        </View>
      </View>

      <Section
        title={t(places.length === 1 ? "city.placeCount.one" : "city.placeCount.many", {
          count: places.length,
        })}
      >
        <View style={styles.list}>
          {places.map((place) => (
            <PlaceImageCard key={place.id} place={place} />
          ))}

          {places.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText type="heading">
                {t("city.emptyTitle")}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {t("city.emptyBody")}
              </ThemedText>
              <Button
                icon="map"
                label={t("common.openMap")}
                onPress={() => router.push("/map")}
              />
            </View>
          ) : null}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: Spacing.three,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.three,
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
  screenContent: {
    paddingTop: Spacing.two,
  },
});
