import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Zoomable } from "@likashefqet/react-native-image-zoom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { Section } from "@/components/ui/section";
import { SymbolIcon } from "@/components/ui/symbol-icon";
import { ThemedText } from "@/components/themed-text";
import { getPlaceBySlug } from "@/data/places";
import { getRecommendedActsForPlace } from "@/data/recommendedActs";
import type { PlaceImage } from "@/domain/types";
import { useI18n } from "@/features/i18n/i18n";
import {
  formatPlaceLocation,
  localizePlace,
  localizeRecommendedActs,
} from "@/features/i18n/localizedData";
import { readerRoute, singleRouteParam } from "@/features/navigation/routes";
import { useBookmarks } from "@/features/storage/useBookmarks";
import { openNavigation } from "@/features/places/openNavigation";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type PlaceImageCarouselProps = {
  images: PlaceImage[];
};

type PlaceImageViewerProps = {
  image: PlaceImage | null;
  onClose: () => void;
};

function getPlaceImageSource(image: PlaceImage) {
  return image.asset ?? { uri: image.uri ?? "" };
}

function ViewerCloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Pressable
      accessibilityLabel={t("place.closeImage")}
      accessibilityRole="button"
      hitSlop={16}
      onPress={onPress}
      style={({ pressed }) => [
        styles.viewerIconButton,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <SymbolIcon color={theme.text} name="close" size={20} />
    </Pressable>
  );
}

function PlaceImageViewer({ image, onClose }: PlaceImageViewerProps) {
  const { height, width } = useWindowDimensions();
  const viewerImageWidth = Math.max(248, width - Spacing.three * 2);
  const viewerImageHeight = Math.max(280, height - Spacing.six * 2);

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(image)}
    >
      <GestureHandlerRootView style={styles.viewerGestureRoot}>
        <View style={styles.viewerBackdrop}>
          <View style={styles.viewerToolbar}>
            <ViewerCloseButton onPress={onClose} />
          </View>

          {image ? (
            <Zoomable
              key={image.id}
              doubleTapScale={2.5}
              isDoubleTapEnabled
              isPanEnabled
              isPinchEnabled
              maxScale={5}
              style={styles.viewerZoom}
            >
              <Image
                accessibilityLabel={image.description}
                contentFit="contain"
                source={getPlaceImageSource(image)}
                style={[
                  styles.viewerImage,
                  {
                    height: viewerImageHeight,
                    width: viewerImageWidth,
                  },
                ]}
                transition={160}
              />
            </Zoomable>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function PlaceImageCarousel({ images }: PlaceImageCarouselProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [selectedImage, setSelectedImage] = useState<PlaceImage | null>(null);
  const imageCardWidth = Math.min(320, Math.max(248, width - Spacing.four * 2));

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageCarousel}
      >
        {images.map((image) => (
          <View
            key={image.id}
            style={[
              styles.imageCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                width: imageCardWidth,
              },
            ]}
          >
            <Pressable
              accessibilityLabel={t("place.imageOpenLabel", {
                description: image.description,
              })}
              accessibilityRole="imagebutton"
              onPress={() => {
                setSelectedImage(image);
              }}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Image
                accessibilityLabel={image.description}
                contentFit="cover"
                source={getPlaceImageSource(image)}
                style={styles.placeImage}
                transition={160}
              />
            </Pressable>
            <View style={styles.imageCaption}>
              <ThemedText type="small">{image.description}</ThemedText>
              <Pressable
                accessibilityRole="link"
                hitSlop={8}
                onPress={() => {
                  void Linking.openURL(image.source.url).catch(() => undefined);
                }}
                style={styles.sourceLink}
              >
                <ThemedText type="smallBold" themeColor="accent">
                  {t("common.sourcePrefix", { source: image.source.title })}
                </ThemedText>
              </Pressable>
              {image.source.author ? (
                <ThemedText type="small">© {image.source.author}</ThemedText>
              ) : null}
              {image.source.license ? (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  onPress={() => {
                    const licenseUrl = image.source.license?.url;
                    if (licenseUrl) {
                      void Linking.openURL(licenseUrl).catch(() => undefined);
                    }
                  }}
                  style={styles.sourceLink}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    {image.source.license.name}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
      <PlaceImageViewer
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}

export default function PlaceDetailScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = singleRouteParam(params.slug);
  const rawPlace = getPlaceBySlug(slug);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { language, t } = useI18n();
  const place = rawPlace ? localizePlace(rawPlace, language) : undefined;

  if (!place) {
    return (
      <Screen>
        <ThemedText type="heading">{t("place.notFound")}</ThemedText>
        <Button
          icon="map"
          label={t("common.toMap")}
          onPress={() => router.push("/map")}
        />
      </Screen>
    );
  }

  const acts = localizeRecommendedActs(
    getRecommendedActsForPlace(place.id),
    language,
  );
  const bookmarkKey = `place:${place.slug}`;

  return (
    <Screen
      contentStyle={styles.screenContent}
      safeAreaEdges={["right", "bottom", "left"]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="eyebrow" themeColor="accent">
            {formatPlaceLocation(place, language)}
          </ThemedText>
          <ThemedText type="title">{place.name}</ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          icon="map"
          label={t("place.startNavigation")}
          onPress={() => openNavigation(place)}
        />
        <Button
          icon="bookmark"
          label={
            isBookmarked(bookmarkKey) ? t("common.saved") : t("common.save")
          }
          variant="secondary"
          onPress={() => toggleBookmark(bookmarkKey)}
        />
      </View>

      <Section title={t("place.about")}>
        <ThemedText>{place.longDescription}</ThemedText>
        {place.historicalNotes ? (
          <ThemedText type="small" themeColor="textSecondary">
            {place.historicalNotes}
          </ThemedText>
        ) : null}
        <PlaceImageCarousel images={place.images} />
      </Section>

      {acts.length > 0 ? (
        <Section title={t("place.recommendedActs")}>
          <View style={styles.list}>
            {acts.map((act) => (
              <Card
                key={act.id}
                onPress={
                  act.contentId ? () => router.push(readerRoute(act.contentId as string)) : undefined
                }
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitle}>
                    <ThemedText type="heading">{act.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t(`labels.actType.${act.type}`)}
                    </ThemedText>
                  </View>
                  <Badge status={act.verificationStatus} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {act.shortInstruction}
                </ThemedText>
              </Card>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  cardTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.72,
  },
  imageCarousel: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  imageCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  placeImage: {
    aspectRatio: 4 / 3,
    width: "100%",
  },
  imageCaption: {
    gap: Spacing.one,
    padding: Spacing.three,
  },
  sourceLink: {
    alignSelf: "flex-start",
  },
  viewerGestureRoot: {
    flex: 1,
  },
  viewerBackdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.92)",
    flex: 1,
    padding: Spacing.three,
  },
  viewerToolbar: {
    position: "absolute",
    right: Spacing.four,
    top: Spacing.four,
    zIndex: 20,
  },
  viewerIconButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 20,
    height: 52,
    justifyContent: "center",
    width: 52,
    zIndex: 99,
    top: 30,
  },
  viewerZoom: {
    flex: 1,
    height: "100%",
    width: "100%",
  },
  viewerImage: {
    borderRadius: 8,
  },
  screenContent: {
    paddingTop: Spacing.two,
  },
});
