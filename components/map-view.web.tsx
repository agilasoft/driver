import React from "react";
import { View, Text, StyleSheet, Linking, TouchableOpacity } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

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

/**
 * Web fallback for NativeMap — renders an OpenStreetMap iframe embed
 * with markers for all leg locations, plus a clickable location list.
 */
export function NativeMap({ legs, initialRegion, allCoords }: NativeMapProps) {
  const colors = useColors();

  // Build an OpenStreetMap embed URL centered on the route
  const zoom = allCoords.length > 1 ? 10 : 13;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    initialRegion.longitude - initialRegion.longitudeDelta / 2
  },${initialRegion.latitude - initialRegion.latitudeDelta / 2},${
    initialRegion.longitude + initialRegion.longitudeDelta / 2
  },${initialRegion.latitude + initialRegion.latitudeDelta / 2}&layer=mapnik&marker=${
    initialRegion.latitude
  },${initialRegion.longitude}`;

  const openInGoogleMaps = (lat: number, lng: number) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    );
  };

  if (allCoords.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface }]}>
        <MaterialIcons name="location-off" size={48} color={colors.border} />
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          No coordinates available to display on the map.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Embedded OpenStreetMap */}
      <View style={styles.mapFrame}>
        <iframe
          src={mapUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 12,
          }}
          title="Route Map"
        />
      </View>

      {/* Location list */}
      <View style={styles.locationList}>
        <View style={styles.legendHeader}>
          <MaterialIcons name="place" size={18} color={colors.primary} />
          <Text style={[styles.legendTitle, { color: colors.foreground }]}>
            Route Stops ({legs.length} leg{legs.length !== 1 ? "s" : ""})
          </Text>
        </View>

        {legs.map((leg, i) => (
          <View
            key={leg.name}
            style={[styles.legItem, { borderBottomColor: colors.border }]}
          >
            <View style={[styles.legBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.legBadgeText}>{i + 1}</Text>
            </View>
            <View style={styles.legDetails}>
              {leg.pickLat !== 0 && leg.pickLng !== 0 ? (
                <TouchableOpacity
                  onPress={() => openInGoogleMaps(leg.pickLat, leg.pickLng)}
                  style={styles.coordRow}
                >
                  <MaterialIcons name="trip-origin" size={14} color="#22C55E" />
                  <Text style={[styles.facilityText, { color: colors.foreground }]} numberOfLines={1}>
                    {leg.facilityFrom}
                  </Text>
                  <MaterialIcons name="open-in-new" size={12} color={colors.muted} />
                </TouchableOpacity>
              ) : (
                <View style={styles.coordRow}>
                  <MaterialIcons name="trip-origin" size={14} color={colors.muted} />
                  <Text style={[styles.facilityText, { color: colors.muted }]} numberOfLines={1}>
                    {leg.facilityFrom} (no coords)
                  </Text>
                </View>
              )}
              {leg.dropLat !== 0 && leg.dropLng !== 0 ? (
                <TouchableOpacity
                  onPress={() => openInGoogleMaps(leg.dropLat, leg.dropLng)}
                  style={styles.coordRow}
                >
                  <MaterialIcons name="place" size={14} color="#EF4444" />
                  <Text style={[styles.facilityText, { color: colors.foreground }]} numberOfLines={1}>
                    {leg.facilityTo}
                  </Text>
                  <MaterialIcons name="open-in-new" size={12} color={colors.muted} />
                </TouchableOpacity>
              ) : (
                <View style={styles.coordRow}>
                  <MaterialIcons name="place" size={14} color={colors.muted} />
                  <Text style={[styles.facilityText, { color: colors.muted }]} numberOfLines={1}>
                    {leg.facilityTo} (no coords)
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapFrame: {
    height: 350,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  locationList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  legendTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  legItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  legBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  legBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  legDetails: {
    flex: 1,
    gap: 4,
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  facilityText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 20,
  },
});
