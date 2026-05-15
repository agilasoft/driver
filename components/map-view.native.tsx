import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

// Conditionally import react-native-maps to prevent web crashes
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;

try {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
} catch (e) {
  // react-native-maps not available (e.g. on web)
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

interface NativeMapProps {
  legs: LegPoint[];
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  allCoords: { latitude: number; longitude: number }[];
}

export function NativeMap({ legs, initialRegion, allCoords }: NativeMapProps) {
  const colors = useColors();
  const mapRef = useRef<any>(null);

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

  // If react-native-maps is not available, show a fallback
  if (!MapView) {
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: colors.surface }]}>
        <Text style={[styles.fallbackText, { color: colors.muted }]}>
          Map is not available on this platform.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={Platform.OS !== "web"}
        showsMyLocationButton={Platform.OS !== "web"}
      >
        {legs.map((leg, i) => (
          <React.Fragment key={leg.name}>
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

            {leg.pickLat && leg.pickLng && leg.dropLat && leg.dropLng ? (
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
      <View
        style={[
          styles.legend,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]}>
            Pick-up
          </Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
          <Text style={[styles.legendText, { color: colors.foreground }]}>
            Drop-off
          </Text>
        </View>
        <Text style={[styles.legendCount, { color: colors.muted }]}>
          {legs.length} leg{legs.length !== 1 ? "s" : ""}
        </Text>
      </View>
    </View>
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
  fallbackContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  fallbackText: {
    fontSize: 14,
    textAlign: "center",
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
