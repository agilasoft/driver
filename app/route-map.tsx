import React, { useMemo } from "react";
import {
  View,
  Text,
  Platform,
  Linking,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
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
  const params = useLocalSearchParams<{ legs: string; runSheetName: string; title: string }>();
  const colors = useColors();
  const screenTitle = params.runSheetName || params.title || "Route Map";

  const legs: LegPoint[] = useMemo(() => {
    try {
      return JSON.parse(params.legs || "[]");
    } catch {
      return [];
    }
  }, [params.legs]);

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
    const lats = allCoords.map((c) => c.latitude);
    const lngs = allCoords.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.05),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.05),
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

  const hasCoords = allCoords.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
        }}
      />

      {hasCoords ? (
        <View style={styles.mapContainer}>
          <NativeMap
            legs={legs}
            initialRegion={initialRegion}
            allCoords={allCoords}
          />

          {/* Navigate buttons overlay at bottom */}
          <View style={[styles.navOverlay, { backgroundColor: colors.surface }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navScroll}>
              {legs.map((leg, i) => (
                <View key={leg.name} style={styles.navItem}>
                  <View style={[styles.navBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.navBadgeText}>{i + 1}</Text>
                  </View>
                  <View style={styles.navButtons}>
                    {leg.pickLat !== 0 && leg.pickLng !== 0 && (
                      <TouchableOpacity
                        onPress={() => openInMaps(leg.pickLat, leg.pickLng, leg.facilityFrom)}
                        style={[styles.navBtn, { backgroundColor: "#22C55E" }]}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="navigation" size={14} color="#fff" />
                        <Text style={styles.navBtnText} numberOfLines={1}>
                          {leg.facilityFrom}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {leg.dropLat !== 0 && leg.dropLng !== 0 && (
                      <TouchableOpacity
                        onPress={() => openInMaps(leg.dropLat, leg.dropLng, leg.facilityTo)}
                        style={[styles.navBtn, { backgroundColor: "#EF4444" }]}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="navigation" size={14} color="#fff" />
                        <Text style={styles.navBtnText} numberOfLines={1}>
                          {leg.facilityTo}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScreenContainer edges={["left", "right"]}>
          <View style={styles.emptyContainer}>
            <MaterialIcons name="location-off" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Coordinates Available
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Could not resolve leg addresses to map coordinates. Ensure addresses are set on the Transport Legs in Frappe.
            </Text>
          </View>
        </ScreenContainer>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
  },
  navOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 10,
    paddingBottom: 30,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  navScroll: {
    paddingHorizontal: 12,
    gap: 10,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 10,
  },
  navBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  navButtons: {
    gap: 4,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 80,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
});
