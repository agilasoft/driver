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
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="map" size={48} color={colors.border} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Active Route
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              {allSheets.length === 0
                ? "No run sheets found. Pull down to refresh."
                : "No run sheets with Dispatched or In-Progress status. Start a trip from the Run Sheets tab."}
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => loadData(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Refresh</Text>
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

  return (
    <ScreenContainer>
      <ConnectivityBanner />

      {/* Active run sheet banner */}
      <TouchableOpacity
        style={[styles.activeBanner, { backgroundColor: colors.primary }]}
        onPress={navigateToRunSheet}
        activeOpacity={0.8}
      >
        <View style={styles.activeBannerContent}>
          <MaterialIcons name="directions" size={22} color="#fff" />
          <View style={styles.activeBannerText}>
            <Text style={styles.activeBannerTitle} numberOfLines={1}>
              {activeSheet.name}
            </Text>
            <Text style={styles.activeBannerSub} numberOfLines={1}>
              {activeSheet.route_name || activeSheet.run_type} — {activeSheet.status} — {bundle.legs.length} leg{bundle.legs.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#fff" />
        </View>
      </TouchableOpacity>

      {hasMapData ? (
        <View style={styles.mapContainer}>
          <NativeMap
            legs={legPoints}
            initialRegion={initialRegion}
            allCoords={allCoords}
          />
        </View>
      ) : (
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
            <MaterialIcons name="location-off" size={40} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Locations Found
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Could not resolve leg addresses to coordinates. Ensure addresses are set on the Transport Legs in Frappe.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => loadData(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="refresh" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Bottom route summary */}
      {hasMapData && (
        <View style={[styles.routeSummary, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeScroll}>
            {resolvedLegs.map((leg, i) => (
              <View key={leg.legName} style={styles.routeStop}>
                {i > 0 && (
                  <MaterialIcons name="chevron-right" size={16} color={colors.muted} style={{ marginRight: 4 }} />
                )}
                <View style={[styles.stopDot, { backgroundColor: "#22C55E" }]} />
                <Text style={[styles.stopText, { color: colors.foreground }]} numberOfLines={1}>
                  {leg.facilityFrom}
                </Text>
                <MaterialIcons name="arrow-forward" size={12} color={colors.muted} style={{ marginHorizontal: 4 }} />
                <View style={[styles.stopDot, { backgroundColor: "#EF4444" }]} />
                <Text style={[styles.stopText, { color: colors.foreground }]} numberOfLines={1}>
                  {leg.facilityTo}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  activeBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  activeBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  activeBannerText: {
    flex: 1,
  },
  activeBannerTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  activeBannerSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
  },
  routeSummary: {
    borderTopWidth: 0.5,
    paddingVertical: 10,
  },
  routeScroll: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  routeStop: {
    flexDirection: "row",
    alignItems: "center",
  },
  stopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  stopText: {
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 100,
  },
});
