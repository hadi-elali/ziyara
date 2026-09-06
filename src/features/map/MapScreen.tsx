import * as Location from "expo-location";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { SymbolIcon } from "@/components/ui/symbol-icon";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { allPlaces } from "@/data/places";
import type { TripNavigationDestination } from "@/domain/database";
import type { Place } from "@/domain/types";
import { useI18n } from "@/features/i18n/i18n";
import {
  formatPlaceLocation,
  localizePlace,
} from "@/features/i18n/localizedData";
import { placeRoute } from "@/features/navigation/routes";
import { openNavigation } from "@/features/places/openNavigation";
import { useTripGuidance } from "@/features/trip-guidance/trip-guidance-context";
import { useTheme } from "@/hooks/use-theme";

import { MapCanvas, type MapCanvasHandle } from "./MapCanvas";
import { IRAQ_REGION, type MapPoint } from "./map-types";

type LocationStatus = "idle" | "loading" | "granted" | "denied" | "error";

export function MapExperience() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const { navigationDestinations } = useTripGuidance();
  const mapRef = useRef<MapCanvasHandle>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(
    allPlaces[0],
  );
  const [selectedDestination, setSelectedDestination] =
    useState<TripNavigationDestination | null>(null);
  const [showDestinations, setShowDestinations] = useState(false);
  const insets = useSafeAreaInsets();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [userLocation, setUserLocation] =
    useState<Location.LocationObject | null>(null);
  const localizedSelectedPlace = selectedPlace
    ? localizePlace(selectedPlace, language)
    : null;

  const centerOnLocation = useCallback((location: Location.LocationObject) => {
    mapRef.current?.animateToRegion(
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      650,
    );
  }, []);

  const showDestinationOnMap = useCallback(
    (destination: TripNavigationDestination) => {
      setShowDestinations(false);
      setSelectedPlace(null);
      setSelectedDestination(destination);
      mapRef.current?.animateToRegion(
        {
          latitude: destination.latitude,
          longitude: destination.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        650,
      );
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (!mounted) return;
        setLocationStatus(permission.granted ? "granted" : "idle");
        if (permission.granted) {
          Location.getLastKnownPositionAsync({ maxAge: 60_000 }).then(
            (lastKnownLocation) => {
              if (mounted && lastKnownLocation) {
                setUserLocation(lastKnownLocation);
              }
            },
          ).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const requestLocation = async () => {
    setLocationStatus("loading");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationStatus("denied");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation(current);
      setLocationStatus("granted");
      centerOnLocation(current);
    } catch {
      setLocationStatus("error");
    }
  };

  const mapPoints = useMemo<MapPoint[]>(() => {
    const placePoints = allPlaces.map((rawPlace) => {
      const place = localizePlace(rawPlace, language);
      const description = formatPlaceLocation(place, language, true);
      return {
        accessibilityLabel: `${place.name}, ${description}`,
        color: theme.accent,
        coordinate: {
          latitude: place.latitude,
          longitude: place.longitude,
        },
        description,
        id: `place:${place.id}`,
        title: place.name,
      };
    });
    const destinationPoints = navigationDestinations.map((destination) => ({
      accessibilityLabel: `${t("map.tripDestination")}: ${destination.name}`,
      color: theme.danger,
      coordinate: {
        latitude: destination.latitude,
        longitude: destination.longitude,
      },
      description: destination.details ?? t("map.tripDestination"),
      id: `destination:${destination.id}`,
      title: destination.name,
    }));
    const userPoint: MapPoint[] = userLocation
      ? [
          {
            accessibilityLabel: t("common.currentLocation"),
            color: theme.warning,
            coordinate: {
              latitude: userLocation.coords.latitude,
              longitude: userLocation.coords.longitude,
            },
            id: "user-location",
            title: t("common.currentLocation"),
          },
        ]
      : [];

    return [...placePoints, ...destinationPoints, ...userPoint];
  }, [language, navigationDestinations, t, theme.accent, theme.danger, theme.warning, userLocation]);

  const handlePointPress = useCallback(
    (id: string) => {
      if (id.startsWith("place:")) {
        const place = allPlaces.find((item) => `place:${item.id}` === id);
        if (!place) return;
        setSelectedDestination(null);
        setSelectedPlace(place);
        return;
      }

      if (id.startsWith("destination:")) {
        const destination = navigationDestinations.find(
          (item) => `destination:${item.id}` === id,
        );
        if (!destination) return;
        setSelectedPlace(null);
        setSelectedDestination(destination);
      }
    },
    [navigationDestinations],
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <MapCanvas
        accessibilityLabel={t("map.title")}
        initialRegion={IRAQ_REGION}
        onPointPress={handlePointPress}
        points={mapPoints}
        ref={mapRef}
        tileErrorMessage={t("map.tilesUnavailable")}
        zoomInLabel={t("map.zoomIn")}
        zoomOutLabel={t("map.zoomOut")}
      />

      {navigationDestinations.length > 0 ? (
        <View style={styles.topBar}>
          <Button
            accessibilityState={{ expanded: showDestinations }}
            icon="map"
            label={t("map.tripDestinationsButton")}
            onPress={() => setShowDestinations(true)}
            style={styles.destinationButton}
            variant="secondary"
          />
        </View>
      ) : null}

      {(locationStatus === "denied" || locationStatus === "error") && (
        <View
          style={[styles.permission, { backgroundColor: theme.warningSoft }]}
        >
          <ThemedText type="smallBold">
            {locationStatus === "denied"
              ? t("map.locationDenied")
              : t("map.locationUnavailable")}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {locationStatus === "denied"
              ? t("map.locationDeniedBody")
              : t("map.locationErrorBody")}
          </ThemedText>
        </View>
      )}

      {(selectedDestination || localizedSelectedPlace) && (
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              bottom: insets.bottom,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitle}>
              <ThemedText type="heading">
                {selectedDestination?.name ?? localizedSelectedPlace?.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedDestination
                  ? selectedDestination.details ?? t("map.tripDestination")
                  : localizedSelectedPlace
                    ? formatPlaceLocation(localizedSelectedPlace, language)
                    : ""}
              </ThemedText>
            </View>
          </View>

          <View style={styles.sheetActions}>
            {localizedSelectedPlace ? (
              <Button
                icon="info"
                label={t("common.details")}
                onPress={() => router.push(placeRoute(localizedSelectedPlace.slug))}
                style={styles.sheetActionButton}
              />
            ) : null}
            <Button
              icon="map"
              label={t("common.navigate")}
              variant="secondary"
              onPress={() =>
                void openNavigation(selectedDestination ?? localizedSelectedPlace!)
              }
              style={styles.sheetActionButton}
            />
          </View>
        </View>
      )}

      <Pressable
        accessibilityLabel={
          locationStatus === "loading"
            ? t("map.locationLoading")
            : userLocation
              ? t("map.recenter")
              : t("map.myLocation")
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: locationStatus === "loading" }}
        disabled={locationStatus === "loading"}
        onPress={() => void requestLocation()}
        style={({ pressed }) => [
          styles.locationButton,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            bottom:
              insets.bottom +
              (selectedDestination || localizedSelectedPlace ? 164 : Spacing.three),
            shadowColor: theme.text,
          },
          pressed && styles.pressed,
          locationStatus === "loading" && styles.locationButtonDisabled,
        ]}
      >
        <SymbolIcon color={theme.location} name="location" size={28} />
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setShowDestinations(false)}
        statusBarTranslucent
        transparent
        visible={showDestinations && navigationDestinations.length > 0}
      >
        <View style={styles.destinationModal}>
          <Pressable
            accessibilityLabel={t("map.closeTripDestinations")}
            accessibilityRole="button"
            onPress={() => setShowDestinations(false)}
            style={[
              StyleSheet.absoluteFill,
              styles.destinationBackdrop,
              { backgroundColor: theme.text },
            ]}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.destinationPanel,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.destinationHeader}>
              <View style={styles.destinationHeaderText}>
                <ThemedText type="subtitle">
                  {t("map.tripDestinationsButton")}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t("map.tripDestinationCount", {
                    count: navigationDestinations.length,
                  })}
                </ThemedText>
              </View>
              <Pressable
                accessibilityLabel={t("map.closeTripDestinations")}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setShowDestinations(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolIcon color={theme.text} name="close" size={22} />
              </Pressable>
            </View>
            <ThemedText themeColor="textSecondary">
              {t("map.tripDestinationListBody")}
            </ThemedText>
            <ScrollView
              contentContainerStyle={styles.destinationList}
              showsVerticalScrollIndicator={false}
              style={styles.destinationScroll}
            >
              {navigationDestinations.map((destination) => (
                <Pressable
                  accessibilityLabel={`${destination.name}. ${t("map.showTripDestinationOnMap")}`}
                  accessibilityRole="button"
                  key={destination.id}
                  onPress={() => showDestinationOnMap(destination)}
                  style={({ pressed }) => [
                    styles.destinationRow,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.danger,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.destinationRowText}>
                    <ThemedText type="heading">{destination.name}</ThemedText>
                    {destination.details ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {destination.details}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="smallBold" themeColor="danger">
                      {t("map.showTripDestinationOnMap")}
                    </ThemedText>
                  </View>
                  <SymbolIcon color={theme.danger} name="chevron" size={22} />
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  destinationBackdrop: {
    opacity: 0.38,
  },
  destinationButton: {
    alignSelf: "flex-start",
  },
  destinationHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  destinationHeaderText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  destinationList: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  destinationModal: {
    flex: 1,
    justifyContent: "flex-end",
  },
  destinationPanel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    height: "86%",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  destinationRow: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 72,
    padding: Spacing.three,
  },
  destinationScroll: {
    flexShrink: 1,
  },
  destinationRowText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  locationButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 54,
    justifyContent: "center",
    position: "absolute",
    right: Spacing.three,
    elevation: 4,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    width: 54,
    zIndex: 2,
  },
  locationButtonDisabled: {
    opacity: 0.55,
  },
  topBar: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  notice: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
    padding: Spacing.three,
  },
  permission: {
    borderRadius: 8,
    gap: Spacing.half,
    marginHorizontal: Spacing.three,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.72,
  },
  sheet: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    gap: Spacing.two,
    left: Spacing.three,
    padding: Spacing.three,
    position: "absolute",
    right: Spacing.three,
  },
  sheetHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  sheetTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  sheetActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  sheetActionButton: {
    flex: 1,
    minWidth: 0,
  },
});
