import React, { useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  Platform,
  StyleSheet,
  Dimensions,
  Linking,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

// Conditionally import MapView only on native
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;

if (Platform.OS !== "web") {
  try {
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
    Polyline = maps.Polyline;
  } catch {
    // Maps not available
  }
}

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
  const mapRef = useRef<any>(null);

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

  // Fit map to show all markers
  useEffect(() => {
    if (mapRef.current && allCoords.length > 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
          animated: true,
        });
      }, 500);
    }
  }, [allCoords]);

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
      // Fallback to Google Maps web
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      );
    });
  };

  // Web fallback — show a list of coordinates with links
  if (Platform.OS === "web" || !MapView) {
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
          <Text className="text-lg font-bold text-foreground mb-2">
            Route Locations
          </Text>
          <Text className="text-xs text-muted mb-4">
            Map view is available on iOS and Android devices. Below are the GPS
            coordinates for each leg.
          </Text>
          {legs.length === 0 ? (
            <View className="flex-1 items-center justify-center">
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
                        Pick: {leg.pickLat.toFixed(6)}, {leg.pickLng.toFixed(6)}
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
        </ScreenContainer>
      </>
    );
  }

  // Native map view
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
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
        >
          {legs.map((leg, i) => (
            <React.Fragment key={leg.name}>
              {/* Pick marker */}
              {leg.pickLat && leg.pickLng ? (
                <Marker
                  coordinate={{
                    latitude: leg.pickLat,
                    longitude: leg.pickLng,
                  }}
                  title={`Leg ${i + 1} Pick-up`}
                  description={leg.facilityFrom}
                  pinColor="#22C55E"
                />
              ) : null}

              {/* Drop marker */}
              {leg.dropLat && leg.dropLng ? (
                <Marker
                  coordinate={{
                    latitude: leg.dropLat,
                    longitude: leg.dropLng,
                  }}
                  title={`Leg ${i + 1} Drop-off`}
                  description={leg.facilityTo}
                  pinColor="#EF4444"
                />
              ) : null}

              {/* Route line between pick and drop */}
              {leg.pickLat &&
              leg.pickLng &&
              leg.dropLat &&
              leg.dropLng ? (
                <Polyline
                  coordinates={[
                    { latitude: leg.pickLat, longitude: leg.pickLng },
                    { latitude: leg.dropLat, longitude: leg.dropLng },
                  ]}
                  strokeColor={colors.primary}
                  strokeWidth={3}
                  lineDashPattern={[6, 3]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </MapView>

        {/* Legend overlay */}
        <View style={[styles.legend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
            <Text style={[styles.legendText, { color: colors.foreground }]}>Pick-up</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
            <Text style={[styles.legendText, { color: colors.foreground }]}>Drop-off</Text>
          </View>
          <Text style={[styles.legendCount, { color: colors.muted }]}>
            {legs.length} leg{legs.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  legend: {
    position: "absolute",
    bottom: 40,
    left: 16,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  legendCount: {
    fontSize: 10,
    marginTop: 2,
  },
});
