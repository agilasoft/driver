import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Linking,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import { useAuth } from "@/lib/auth-context";
import type { RunSheet, RunSheetBundle } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
  getCachedBundle,
  refreshBundle,
} from "@/lib/offline-store";
import { NativeMap } from "@/components/map-view";
import {
  resolveAllLegCoordinates,
  type ResolvedLegCoords,
} from "@/lib/geocoding";

interface LegPoint {
  name: string;
  pickLat: number;
  pickLng: number;
  dropLat: number;
  dropLng: number;
  facilityFrom: string;
  facilityTo: string;
}

const ACTIVE_STATUSES = ["Dispatched", "In-Progress"];

export default function MapTabScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isOnline } = useSync();
  const { auth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [activeSheet, setActiveSheet] = useState<RunSheet | null>(null);
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [allSheets, setAllSheets] = useState<RunSheet[]>([]);
  const [resolvedLegs, setResolvedLegs] = useState<ResolvedLegCoords[]>([]);

  const geocodeLegs = useCallback(
    async (bundleData: RunSheetBundle) => {
      if (!auth) return;
      setIsGeocoding(true);
      try {
        const baseUrl = auth.siteUrl.replace(/\/+$/, "");
        const headers = {
          Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        const resolved = await resolveAllLegCoordinates({
          legs: bundleData.legs,
          baseUrl,
          headers,
        });
        setResolvedLegs(resolved);
      } catch (error) {
        console.warn("[Map] Geocoding failed:", error);
        setResolvedLegs([]);
      } finally {
        setIsGeocoding(false);
      }
    },
    [auth]
  );

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        let sheets: RunSheet[];
        if (isOnline) {
          sheets = await refreshRunSheets();
        } else {
          sheets = await getCachedRunSheets();
        }
        setAllSheets(sheets);

        // Find the most recent active run sheet
        const active = sheets.find((s) => ACTIVE_STATUSES.includes(s.status));
        setActiveSheet(active || null);

        if (active) {
          let bundleData: RunSheetBundle | null;
          if (isOnline) {
            try {
              bundleData = await refreshBundle(active.name);
            } catch {
              bundleData = await getCachedBundle(active.name);
            }
          } else {
            bundleData = await getCachedBundle(active.name);
          }
          setBundle(bundleData);

          // Geocode leg addresses
          if (bundleData) {
            await geocodeLegs(bundleData);
          }
        } else {
          setBundle(null);
          setResolvedLegs([]);
        }
      } catch {
        const cached = await getCachedRunSheets();
        setAllSheets(cached);
        const active = cached.find((s) => ACTIVE_STATUSES.includes(s.status));
        setActiveSheet(active || null);
        if (active) {
          const bundleData = await getCachedBundle(active.name);
          setBundle(bundleData);
          if (bundleData) {
            await geocodeLegs(bundleData);
          }
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isOnline, geocodeLegs]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build leg points from resolved geocoded coordinates
  const legPoints: LegPoint[] = useMemo(() => {
    return resolvedLegs.map((leg) => ({
      name: leg.legName,
      pickLat: leg.pickCoords?.latitude || 0,
      pickLng: leg.pickCoords?.longitude || 0,
      dropLat: leg.dropCoords?.latitude || 0,
      dropLng: leg.dropCoords?.longitude || 0,
      facilityFrom: leg.facilityFrom,
      facilityTo: leg.facilityTo,
    }));
  }, [resolvedLegs]);

  const allCoords = useMemo(() => {
    const coords: { latitude: number; longitude: number }[] = [];
    legPoints.forEach((leg) => {
      if (leg.pickLat && leg.pickLng) {
        coords.push({ latitude: leg.pickLat, longitude: leg.pickLng });
      }
      if (leg.dropLat && leg.dropLng) {
        coords.push({ latitude: leg.dropLat, longitude: leg.dropLng });
      }
    });
    return coords;
  }, [legPoints]);

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

    // Calculate delta to fit all points
    const latitudes = allCoords.map((c) => c.latitude);
    const longitudes = allCoords.map((c) => c.longitude);
    const latDelta =
      Math.max(
        (Math.max(...latitudes) - Math.min(...latitudes)) * 1.5,
        0.05
      );
    const lngDelta =
      Math.max(
        (Math.max(...longitudes) - Math.min(...longitudes)) * 1.5,
        0.05
      );

    return {
      latitude: avgLat,
      longitude: avgLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
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

  const navigateToRunSheet = () => {
    if (activeSheet) {
      router.push({
        pathname: "/run-sheet/[id]",
        params: { id: activeSheet.name },
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Loading route...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // No active run sheet
  if (!activeSheet || !bundle) {
    return (
      <ScreenContainer>
        <ConnectivityBanner />
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surface },
              ]}
            >
              <MaterialIcons name="map" size={48} color={colors.border} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Active Route
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {allSheets.length === 0
                ? "No run sheets found. Pull down to refresh."
                : "No run sheets with Dispatched or In-Progress status. Start a trip from the Run Sheets tab to see the route here."}
            </Text>
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
              onPress={() => loadData(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Geocoding in progress
  if (isGeocoding && allCoords.length === 0) {
    return (
      <ScreenContainer>
        <ConnectivityBanner />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Resolving addresses...
          </Text>
          <Text style={[styles.loadingSubtext, { color: colors.muted }]}>
            Converting leg addresses to map coordinates
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const hasMapData = allCoords.length > 0;

  // Web fallback: show address-based coordinate list
  if (Platform.OS === "web") {
    return (
      <ScreenContainer>
        <ConnectivityBanner />
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor={colors.primary}
            />
          }
        >
          {/* Active run sheet banner */}
          <TouchableOpacity
            style={[styles.activeBanner, { backgroundColor: colors.primary }]}
            onPress={navigateToRunSheet}
            activeOpacity={0.8}
          >
            <View style={styles.activeBannerContent}>
              <MaterialIcons name="directions" size={24} color="#fff" />
              <View style={styles.activeBannerText}>
                <Text style={styles.activeBannerTitle}>
                  {activeSheet.name}
                </Text>
                <Text style={styles.activeBannerSub}>
                  {activeSheet.route_name || activeSheet.run_type} —{" "}
                  {activeSheet.status}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Route Locations
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              Coordinates resolved from leg addresses. Interactive map available
              on iOS/Android.
            </Text>
          </View>

          {!hasMapData ? (
            <View style={styles.noDataContainer}>
              <MaterialIcons name="location-off" size={40} color={colors.border} />
              <Text style={[styles.noDataText, { color: colors.muted }]}>
                Could not resolve addresses to coordinates. Check that leg
                addresses are set correctly in the system.
              </Text>
            </View>
          ) : (
            <View style={styles.legListContainer}>
              {resolvedLegs.map((leg, i) => (
                <View
                  key={leg.legName}
                  style={[
                    styles.legCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.legCardHeader}>
                    <View
                      style={[
                        styles.legNumber,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text style={styles.legNumberText}>{i + 1}</Text>
                    </View>
                    <Text
                      style={[styles.legCardTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {leg.facilityFrom} → {leg.facilityTo}
                    </Text>
                  </View>

                  {/* Pick location */}
                  {leg.pickCoords ? (
                    <TouchableOpacity
                      onPress={() =>
                        openInMaps(
                          leg.pickCoords!.latitude,
                          leg.pickCoords!.longitude,
                          leg.facilityFrom
                        )
                      }
                      style={styles.coordRow}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name="trip-origin"
                        size={16}
                        color={colors.success}
                      />
                      <View style={styles.coordInfo}>
                        <Text
                          style={[styles.coordLabel, { color: colors.foreground }]}
                        >
                          {leg.facilityFrom}
                        </Text>
                        <Text
                          style={[styles.coordText, { color: colors.muted }]}
                        >
                          {leg.pickCoords.latitude.toFixed(6)},{" "}
                          {leg.pickCoords.longitude.toFixed(6)}
                          {leg.pickCoords.source === "gps" ? " (GPS)" : ""}
                        </Text>
                      </View>
                      <MaterialIcons
                        name="open-in-new"
                        size={14}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.coordRow}>
                      <MaterialIcons
                        name="trip-origin"
                        size={16}
                        color={colors.muted}
                      />
                      <View style={styles.coordInfo}>
                        <Text
                          style={[styles.coordLabel, { color: colors.muted }]}
                        >
                          {leg.facilityFrom}
                        </Text>
                        <Text
                          style={[styles.coordText, { color: colors.muted }]}
                        >
                          Address not resolved
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Drop location */}
                  {leg.dropCoords ? (
                    <TouchableOpacity
                      onPress={() =>
                        openInMaps(
                          leg.dropCoords!.latitude,
                          leg.dropCoords!.longitude,
                          leg.facilityTo
                        )
                      }
                      style={styles.coordRow}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name="place"
                        size={16}
                        color={colors.error}
                      />
                      <View style={styles.coordInfo}>
                        <Text
                          style={[styles.coordLabel, { color: colors.foreground }]}
                        >
                          {leg.facilityTo}
                        </Text>
                        <Text
                          style={[styles.coordText, { color: colors.muted }]}
                        >
                          {leg.dropCoords.latitude.toFixed(6)},{" "}
                          {leg.dropCoords.longitude.toFixed(6)}
                          {leg.dropCoords.source === "gps" ? " (GPS)" : ""}
                        </Text>
                      </View>
                      <MaterialIcons
                        name="open-in-new"
                        size={14}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.coordRow}>
                      <MaterialIcons
                        name="place"
                        size={16}
                        color={colors.muted}
                      />
                      <View style={styles.coordInfo}>
                        <Text
                          style={[styles.coordLabel, { color: colors.muted }]}
                        >
                          {leg.facilityTo}
                        </Text>
                        <Text
                          style={[styles.coordText, { color: colors.muted }]}
                        >
                          Address not resolved
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Native: show interactive map with overlay
  return (
    <ScreenContainer edges={["left", "right"]}>
      <ConnectivityBanner />
      <View style={styles.mapContainer}>
        {hasMapData ? (
          <NativeMap
            legs={legPoints}
            initialRegion={initialRegion}
            allCoords={allCoords}
          />
        ) : (
          <View
            style={[
              styles.noGpsContainer,
              { backgroundColor: colors.surface },
            ]}
          >
            <MaterialIcons
              name="location-off"
              size={48}
              color={colors.border}
            />
            <Text style={[styles.noGpsText, { color: colors.muted }]}>
              Could not resolve leg addresses to coordinates.{"\n"}Ensure
              addresses are set on the transport legs.
            </Text>
            <TouchableOpacity
              style={[styles.refreshBtn, { backgroundColor: colors.primary }]}
              onPress={() => loadData(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.refreshBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active run sheet overlay card */}
        <TouchableOpacity
          style={[
            styles.overlayCard,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
          onPress={navigateToRunSheet}
          activeOpacity={0.8}
        >
          <View style={styles.overlayCardInner}>
            <View
              style={[
                styles.overlayStatusDot,
                {
                  backgroundColor:
                    activeSheet.status === "In-Progress"
                      ? colors.warning
                      : colors.primary,
                },
              ]}
            />
            <View style={styles.overlayCardText}>
              <Text
                style={[styles.overlayTitle, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {activeSheet.name}
              </Text>
              <Text
                style={[styles.overlaySub, { color: colors.muted }]}
                numberOfLines={1}
              >
                {activeSheet.route_name || activeSheet.run_type} —{" "}
                {bundle.legs.length} leg{bundle.legs.length !== 1 ? "s" : ""} —{" "}
                {activeSheet.status}
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={colors.muted}
            />
          </View>

          {/* Leg progress indicators */}
          <View style={styles.legProgressRow}>
            {bundle.legs.map((leg) => {
              const hasPickData = !!leg.pick_signature || !!leg.start_date;
              const hasDropData = !!leg.drop_signature || !!leg.end_date;
              const isComplete = hasPickData && hasDropData;
              const isPartial = hasPickData || hasDropData;
              return (
                <View
                  key={leg.name}
                  style={[
                    styles.legProgressDot,
                    {
                      backgroundColor: isComplete
                        ? colors.success
                        : isPartial
                        ? colors.warning
                        : colors.border,
                    },
                  ]}
                />
              );
            })}
          </View>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 12,
  },
  loadingSubtext: {
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  mapContainer: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 20,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  refreshBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  activeBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  activeBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  activeBannerText: {
    flex: 1,
  },
  activeBannerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  activeBannerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  noDataText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  legListContainer: {
    paddingHorizontal: 16,
  },
  legCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  legCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  legNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  legNumberText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  legCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 4,
    paddingVertical: 4,
  },
  coordInfo: {
    flex: 1,
  },
  coordLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  coordText: {
    fontSize: 12,
    marginTop: 1,
  },
  noGpsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  noGpsText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  overlayCard: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  overlayCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  overlayStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  overlayCardText: {
    flex: 1,
  },
  overlayTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  overlaySub: {
    fontSize: 12,
    marginTop: 2,
  },
  legProgressRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  legProgressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
});
