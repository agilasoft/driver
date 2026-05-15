import React from "react";
import { View, Text, StyleSheet, Linking, TouchableOpacity, ScrollView } from "react-native";
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
 * Web fallback for NativeMap — renders a location list with links to Google Maps.
 * react-native-maps is not supported on web, so we show a clean list instead.
 */
export function NativeMap({ legs, initialRegion, allCoords }: NativeMapProps) {
  const colors = useColors();

  const openInGoogleMaps = (lat: number, lng: number) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    );
  };

  const openFullRoute = () => {
    if (allCoords.length === 0) return;
    // Build a Google Maps directions URL with waypoints
    const origin = `${allCoords[0].latitude},${allCoords[0].longitude}`;
    const dest = `${allCoords[allCoords.length - 1].latitude},${allCoords[allCoords.length - 1].longitude}`;
    const waypoints = allCoords
      .slice(1, -1)
      .map((c) => `${c.latitude},${c.longitude}`)
      .join("|");
    const url = waypoints
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${waypoints}`
      : `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
    Linking.openURL(url);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Map placeholder with "Open in Google Maps" */}
      <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="map" size={48} color={colors.primary} />
        <Text style={[styles.mapPlaceholderTitle, { color: colors.foreground }]}>
          Map View
        </Text>
        <Text style={[styles.mapPlaceholderSubtitle, { color: colors.muted }]}>
          Native maps are available on iOS and Android devices.
        </Text>
        <TouchableOpacity
          onPress={openFullRoute}
          style={[styles.openMapsBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
        >
          <MaterialIcons name="open-in-new" size={18} color="#fff" />
          <Text style={styles.openMapsBtnText}>Open Route in Google Maps</Text>
        </TouchableOpacity>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  mapPlaceholder: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  mapPlaceholderTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 8,
  },
  mapPlaceholderSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  openMapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  openMapsBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  locationList: {
    paddingHorizontal: 16,
    paddingTop: 20,
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
