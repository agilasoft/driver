import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useSync } from "@/lib/sync-context";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";
import {
  getCachedBundle,
  refreshBundle,
  addPendingStatusChange,
  applyLocalStatusChange,
} from "@/lib/offline-store";
import { updateRunSheetStatus } from "@/lib/frappe-api";
import { generateRunSheetPdf } from "@/lib/pdf-generator";
import { useAuth } from "@/lib/auth-context";
import { resolveAllLegCoordinates } from "@/lib/geocoding";
import { useGeofence, buildGeofenceTargets } from "@/lib/geofence";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const GREEN = "#34C759";
const RED = "#FF3B30";
const WARN = "#FF9500";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const FG = "#1A1A1A";

export default function RunSheetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isOnline, refreshPendingCount } = useSync();
  const { auth } = useAuth();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isResolvingMap, setIsResolvingMap] = useState(false);
  const { isEnabled: geofenceEnabled, setTargets: setGeofenceTargets } = useGeofence();

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (!id) return;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        if (isOnline) {
          try {
            const data = await refreshBundle(id);
            setBundle(data);
          } catch {
            const cached = await getCachedBundle(id);
            setBundle(cached);
          }
        } else {
          const cached = await getCachedBundle(id);
          setBundle(cached);
        }
      } catch {
        const cached = await getCachedBundle(id);
        setBundle(cached);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id, isOnline]
  );

  useEffect(() => { loadData(); }, [loadData]);

  // Set geofence targets when bundle loads and geofence is enabled
  useEffect(() => {
    if (!geofenceEnabled || !bundle || !auth) return;
    const resolveTargets = async () => {
      try {
        const baseUrl = auth.siteUrl.replace(/\/+$/, "");
        const headers = {
          Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const resolved = await resolveAllLegCoordinates({ legs: bundle.legs, baseUrl, headers });
        const targets = buildGeofenceTargets(resolved);
        setGeofenceTargets(targets);
      } catch {
        // Silently fail — geofence is optional
      }
    };
    resolveTargets();
  }, [geofenceEnabled, bundle, auth, setGeofenceTargets]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return dateStr; }
  };

  const openRouteMap = async () => {
    if (!bundle || !auth) return;
    setIsResolvingMap(true);
    try {
      const baseUrl = auth.siteUrl.replace(/\/+$/, "");
      const headers = {
        Authorization: `token ${auth.apiKey}:${auth.apiSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const resolved = await resolveAllLegCoordinates({ legs: bundle.legs, baseUrl, headers });
      const legsJson = JSON.stringify(
        resolved.map((r) => ({
          name: r.legName,
          pickLat: r.pickCoords?.latitude || 0,
          pickLng: r.pickCoords?.longitude || 0,
          dropLat: r.dropCoords?.latitude || 0,
          dropLng: r.dropCoords?.longitude || 0,
          facilityFrom: r.facilityFrom,
          facilityTo: r.facilityTo,
        }))
      );
      router.push({ pathname: "/route-map", params: { legs: legsJson, title: id || "Route" } });
    } catch {
      Alert.alert("Error", "Failed to resolve route addresses. Please try again.");
    } finally {
      setIsResolvingMap(false);
    }
  };

  const handleExportPdf = async () => {
    if (!bundle) return;
    setIsGeneratingPdf(true);
    try {
      const fileUri = await generateRunSheetPdf(bundle);
      const fileName = fileUri.split("/").pop() || "RunSheet.pdf";
      Alert.alert("PDF Ready", `Choose an action for ${fileName}`, [
        {
          text: "Share",
          onPress: async () => {
            const Sharing = await import("expo-sharing");
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: `Share ${fileName}` });
            } else { Alert.alert("Sharing not available on this device"); }
          },
        },
        {
          text: "Print",
          onPress: async () => {
            const Print = await import("expo-print");
            await Print.printAsync({ uri: fileUri });
          },
        },
        { text: "Done", style: "cancel" },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to generate PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleStatusUpdate = (newStatus: string) => {
    if (!bundle) return;
    Alert.alert("Update Status", `Change status to "${newStatus}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          setIsUpdatingStatus(true);
          try {
            if (isOnline) {
              await updateRunSheetStatus(id!, newStatus);
              await loadData(true);
              Alert.alert("Success", `Status updated to ${newStatus}`);
            } else {
              const change = { runSheetName: id!, status: newStatus, timestamp: new Date().toISOString() };
              await addPendingStatusChange(change);
              await applyLocalStatusChange(id!, newStatus);
              await refreshPendingCount();
              const updatedBundle = await getCachedBundle(id!);
              if (updatedBundle) setBundle(updatedBundle);
              Alert.alert("Queued", "Status change will sync when online.");
            }
          } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to update status.");
          } finally {
            setIsUpdatingStatus(false);
          }
        },
      },
    ]);
  };

  const renderStatusActions = (currentStatus: string) => {
    const transitions: { label: string; status: string; icon: string; color: string }[] = [];
    if (currentStatus === "Dispatched" || currentStatus === "Draft") {
      transitions.push({ label: "Start Trip", status: "In-Progress", icon: "play-arrow", color: ORANGE });
    }
    if (currentStatus === "In-Progress") {
      transitions.push({ label: "Complete", status: "Completed", icon: "check-circle", color: GREEN });
      transitions.push({ label: "Hold", status: "Hold", icon: "pause-circle-filled", color: WARN });
    }
    if (currentStatus === "Hold") {
      transitions.push({ label: "Resume", status: "In-Progress", icon: "play-arrow", color: BLUE });
    }
    if (transitions.length === 0) return null;
    return (
      <View style={st.statusActionsRow}>
        {transitions.map((t) => (
          <TouchableOpacity
            key={t.status}
            style={[st.statusBtn, { backgroundColor: t.color, opacity: isUpdatingStatus ? 0.6 : 1 }]}
            onPress={() => handleStatusUpdate(t.status)}
            activeOpacity={0.8}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name={t.icon as any} size={18} color="#fff" />
                <Text style={st.statusBtnText}>{t.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderLeg = ({ item, index }: { item: TransportLeg; index: number }) => {
    const hasPickData = !!item.pick_signature || !!item.start_date;
    const hasDropData = !!item.drop_signature || !!item.end_date;
    const isComplete = hasPickData && hasDropData;
    const isPartial = hasPickData || hasDropData;

    return (
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/leg/[legId]", params: { legId: item.name, runSheetId: id || "" } })}
        activeOpacity={0.7}
        style={[
          st.legCard,
          {
            borderLeftColor: isComplete ? GREEN : isPartial ? WARN : BLUE,
            borderLeftWidth: 4,
          },
        ]}
      >
        <View style={st.legHeader}>
          <View style={[st.legBadge, { backgroundColor: isComplete ? GREEN : isPartial ? WARN : BLUE }]}>
            <Text style={st.legBadgeText}>{index + 1}</Text>
          </View>
          <View style={st.legHeaderText}>
            <Text style={st.legTitle} numberOfLines={1}>
              {item.facility_from || "Origin"} → {item.facility_to || "Destination"}
            </Text>
            <Text style={st.legSubtitle}>{item.name}</Text>
          </View>
          <View style={st.legStatusIcons}>
            <MaterialIcons name="trip-origin" size={16} color={hasPickData ? GREEN : BORDER} />
            <MaterialIcons name="place" size={16} color={hasDropData ? GREEN : BORDER} />
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#C7C7CC" />
        </View>

        <View style={st.legInfoRow}>
          {item.start_date ? (
            <View style={st.legInfoChip}>
              <MaterialIcons name="schedule" size={12} color={GREEN} />
              <Text style={st.legInfoText}>
                Pick: {new Date(item.start_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          {item.end_date ? (
            <View style={st.legInfoChip}>
              <MaterialIcons name="schedule" size={12} color={RED} />
              <Text style={st.legInfoText}>
                Drop: {new Date(item.end_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          {item.pick_signature ? (
            <View style={st.legInfoChip}>
              <MaterialIcons name="draw" size={12} color={GREEN} />
              <Text style={st.legInfoText}>Signed</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (!bundle) return null;
    const doc = bundle.doc;
    return (
      <View style={st.headerContainer}>
        <View style={st.infoCard}>
          <View style={st.infoCardHeader}>
            <Text style={st.infoCardTitle}>{doc.name}</Text>
            <StatusBadge status={doc.status} />
          </View>

          {doc.route_name ? <Text style={st.routeName} numberOfLines={1}>{doc.route_name}</Text> : null}

          <View style={st.infoGrid}>
            <InfoRow icon="event" label="Date" value={formatDate(doc.run_date)} />
            <InfoRow icon="label" label="Type" value={doc.run_type} />
            <InfoRow icon="local-shipping" label="Vehicle" value={doc.vehicle || "—"} />
            <InfoRow icon="person" label="Driver" value={doc.driver_name || "—"} />
            {doc.dispatch_terminal ? <InfoRow icon="warehouse" label="Dispatch" value={doc.dispatch_terminal} /> : null}
          </View>

          <View style={st.actionRow}>
            <TouchableOpacity
              style={[st.actionBtn, { backgroundColor: BLUE, opacity: isResolvingMap ? 0.7 : 1 }]}
              onPress={openRouteMap}
              activeOpacity={0.8}
              disabled={isResolvingMap}
            >
              {isResolvingMap ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="map" size={20} color="#fff" />}
              <Text style={st.actionBtnText}>{isResolvingMap ? "Loading..." : "Route Map"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.actionBtn, { backgroundColor: ORANGE, opacity: isGeneratingPdf ? 0.6 : 1 }]}
              onPress={handleExportPdf}
              activeOpacity={0.8}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />}
              <Text style={st.actionBtnText}>{isGeneratingPdf ? "..." : "PDF"}</Text>
            </TouchableOpacity>
          </View>

          {renderStatusActions(doc.status)}
        </View>

        <Text style={st.sectionTitle}>Transport Legs ({bundle.legs.length})</Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: id || "Run Sheet",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: BLUE },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
        }}
      />
      <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
        <ConnectivityBanner />

        {isLoading ? (
          <View style={st.centerContainer}>
            <ActivityIndicator size="large" color={BLUE} />
            <Text style={st.loadingText}>Loading...</Text>
          </View>
        ) : !bundle ? (
          <View style={st.centerContainer}>
            <MaterialIcons name="error-outline" size={48} color={BORDER} />
            <Text style={st.errorText}>Could not load run sheet</Text>
          </View>
        ) : (
          <FlatList
            data={bundle.legs}
            keyExtractor={(item) => item.name}
            renderItem={renderLeg}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} tintColor={BLUE} />
            }
            style={{ backgroundColor: "#FFFFFF" }}
          />
        )}
      </ScreenContainer>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={st.infoRow2}>
      <MaterialIcons name={icon as any} size={18} color={GRAY} />
      <Text style={st.infoLabel}>{label}</Text>
      <Text style={st.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  headerContainer: { paddingHorizontal: 16, marginBottom: 8 },
  infoCard: {
    borderRadius: 12, padding: 20, backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  infoCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  infoCardTitle: { fontSize: 20, fontWeight: "800", flex: 1, marginRight: 12, color: FG },
  routeName: { fontSize: 15, fontWeight: "500", marginBottom: 14, color: FG },
  infoGrid: { gap: 8 },
  infoRow2: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 13, width: 64, fontWeight: "500", color: GRAY },
  infoValue: { fontSize: 14, fontWeight: "600", flex: 1, color: FG },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  statusActionsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  statusBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  statusBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 24, marginBottom: 8, marginLeft: 4, color: FG },
  legCard: {
    borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 8, backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
  },
  legHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  legBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  legBadgeText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  legHeaderText: { flex: 1 },
  legTitle: { fontSize: 15, fontWeight: "600", color: FG },
  legSubtitle: { fontSize: 12, marginTop: 2, color: GRAY },
  legStatusIcons: { flexDirection: "row", gap: 4 },
  legInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, paddingLeft: 44 },
  legInfoChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#F5F5F7" },
  legInfoText: { fontSize: 11, fontWeight: "500", color: GRAY },
  centerContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  loadingText: { fontSize: 14, marginTop: 12, color: GRAY },
  errorText: { fontSize: 15, marginTop: 16, color: GRAY },
});
