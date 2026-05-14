import React, { useMemo } from "react";
import {
  View,
  Text,
  Platform,
  Linking,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { NativeMap } from "@/components/map-view";

interface LegPoint {
  name: string;
  pickLat: number;
  pickLng: number;
  dropLat: number;
  dropLng: number;
  facilityFrom: string;
  facilityTo: string;
}

export default function RouteMapScreen() {
  const params = useLocalSearchParams<{ legs: string; runSheetName: string }>();
  const colors = useColors();

  const legs: LegPoint[] = useMemo(() => {
    try {
      return JSON.parse(params.legs || "[]");
    } catch {
      return [];
    }
  }, [params.legs]);

  // Collect all valid coordinates
  const allCoords = useMemo(() => {
    const coords: { latitude: number; longitude: number }[] = [];
    legs.forEach((leg) => {
      if (leg.pickLat && leg.pickLng) {
        coords.push({ latitude: leg.pickLat, longitude: leg.pickLng });
      }
      if (leg.dropLat && leg.dropLng) {
        coords.push({ latitude: leg.dropLat, longitude: leg.dropLng });
      }
    });
    return coords;
  }, [legs]);

  const initialRegion = useMemo(() => {
    if (allCoords.length === 0) {
      return {
        latitude: 14.5995,
        longitude: 120.9842,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      };
    }
    const avgLat =
      allCoords.reduce((s, c) => s + c.latitude, 0) / allCoords.length;
    const avgLng =
      allCoords.reduce((s, c) => s + c.longitude, 0) / allCoords.length;
    return {
      latitude: avgLat,
      longitude: avgLng,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    };
  }, [allCoords]);

  const openInMaps = (lat: number, lng: number, label: string) => {
    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${label}@${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      );
    });
  };

  // On web, show a coordinate list with links to Google Maps
  if (Platform.OS === "web") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Route Map",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.foreground },
          }}
        />
        <ScreenContainer edges={["left", "right"]} className="px-4 pt-4">
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            <Text className="text-lg font-bold text-foreground mb-2">
              Route Locations
            </Text>
            <Text className="text-xs text-muted mb-4">
              Map view is available on iOS and Android devices. Below are the GPS
              coordinates for each leg.
            </Text>
            {legs.length === 0 ? (
              <View className="flex-1 items-center justify-center py-20">
                <MaterialIcons name="map" size={48} color={colors.border} />
                <Text className="text-muted mt-3">
                  No GPS coordinates recorded yet
                </Text>
              </View>
            ) : (
              legs.map((leg, i) => (
                <View
                  key={leg.name}
                  className="bg-surface rounded-xl p-3 border border-border mb-3"
                >
                  <Text className="text-sm font-semibold text-foreground mb-2">
                    Leg {i + 1}: {leg.name}
                  </Text>
                  {leg.pickLat && leg.pickLng ? (
                    <TouchableOpacity
                      onPress={() =>
                        openInMaps(leg.pickLat, leg.pickLng, leg.facilityFrom)
                      }
                      activeOpacity={0.7}
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <MaterialIcons
                          name="trip-origin"
                          size={14}
                          color={colors.success}
                        />
                        <Text className="text-xs text-primary">
                          Pick: {leg.pickLat.toFixed(6)},{" "}
                          {leg.pickLng.toFixed(6)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-row items-center gap-2 mb-1">
                      <MaterialIcons
                        name="trip-origin"
                        size={14}
                        color={colors.muted}
                      />
                      <Text className="text-xs text-muted">
                        Pick: No GPS recorded
                      </Text>
                    </View>
                  )}
                  {leg.dropLat && leg.dropLng ? (
                    <TouchableOpacity
                      onPress={() =>
                        openInMaps(leg.dropLat, leg.dropLng, leg.facilityTo)
                      }
                      activeOpacity={0.7}
                    >
                      <View className="flex-row items-center gap-2">
                        <MaterialIcons
                          name="place"
                          size={14}
                          color={colors.error}
                        />
                        <Text className="text-xs text-primary">
                          Drop: {leg.dropLat.toFixed(6)},{" "}
                          {leg.dropLng.toFixed(6)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <MaterialIcons
                        name="place"
                        size={14}
                        color={colors.muted}
                      />
                      <Text className="text-xs text-muted">
                        Drop: No GPS recorded
                      </Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </ScreenContainer>
      </>
    );
  }

  // On native, show the interactive map
  return (
    <>
      <Stack.Screen
        options={{
          title: params.runSheetName || "Route Map",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
        }}
      />
      <NativeMap
        legs={legs}
        initialRegion={initialRegion}
        allCoords={allCoords}
      />
    </>
  );
}
