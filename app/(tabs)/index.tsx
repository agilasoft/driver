import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { useCurrentJob } from "@/lib/current-job";
import { useSync } from "@/lib/sync-context";
import { useShiftLog, formatDurationShort } from "@/lib/shift-log";
import { getCachedBundle, refreshBundle } from "@/lib/offline-store";
import { updateRunSheetStatus } from "@/lib/frappe-api";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";

export default function CurrentJobTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth } = useAuth();
  const { currentJobId, setCurrentJob } = useCurrentJob();
  const { refreshPendingCount } = useSync();
  const shiftLog = useShiftLog();
  const isClocked = shiftLog?.isClocked ?? false;
  const elapsedMs = shiftLog?.elapsedMs ?? 0;
  const clockIn = shiftLog?.clockIn ?? (async () => {});
  const clockOut = shiftLog?.clockOut ?? (async () => {});
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentJobId) { setBundle(null); return; }
    const cached = await getCachedBundle(currentJobId);
    if (cached) setBundle(cached);
    try {
      const fresh = await refreshBundle(currentJobId);
      setBundle(fresh);
    } catch { /* use cached */ }
  }, [currentJobId]);

  useEffect(() => { setLoading(true); loadData().finally(() => setLoading(false)); }, [loadData]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const handleCompleteJob = useCallback(async () => {
    if (!bundle) return;
    Alert.alert("Complete Job", "Mark this run sheet as Completed?", [
      { text: "Cancel", style: "cancel" },
      { text: "Complete", style: "default", onPress: async () => {
        try {
          await updateRunSheetStatus(bundle.doc.name, "Completed");
          await loadData();
          await refreshPendingCount();
        } catch (err: any) { Alert.alert("Error", err.message); }
      }},
    ]);
  }, [bundle, loadData, refreshPendingCount]);

  const completedLegs = bundle?.legs.filter((l) => l.status === "Completed" || l.status === "Done").length || 0;
  const totalLegs = bundle?.legs.length || 0;
  const allDone = totalLegs > 0 && completedLegs === totalLegs;
  const nextLeg = bundle?.legs.find((l) => l.status !== "Completed" && l.status !== "Done");

  const renderLeg = ({ item }: { item: TransportLeg }) => {
    const isDone = item.status === "Completed" || item.status === "Done";
    return (
      <TouchableOpacity style={st.legCard} onPress={() => router.push(`/leg/${item.name}`)} activeOpacity={0.7}>
        <View style={[st.legDot, { backgroundColor: isDone ? "#34C759" : "#E5E5EA" }]} />
        <View style={st.legInfo}>
          <Text style={st.legIdx}>Leg {item.idx}</Text>
          <Text style={st.legRoute} numberOfLines={1}>{item.facility_from || "—"} → {item.facility_to || "—"}</Text>
        </View>
        <StatusBadge status={item.status || "Pending"} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <View style={st.headerRow}>
          <View>
            <Text style={st.headerName}>{auth?.driverName || auth?.fullName || "Driver"}</Text>
            <Text style={st.headerSub}>{currentJobId || "No active job"}</Text>
          </View>
          <TouchableOpacity style={st.clockBtn} onPress={isClocked ? clockOut : clockIn}>
            <MaterialIcons name={isClocked ? "timer" : "timer-off"} size={18} color="#fff" />
            <Text style={st.clockText}>{isClocked ? formatDurationShort(elapsedMs) : "Clock In"}</Text>
          </TouchableOpacity>
        </View>
        {bundle && (
          <View style={st.progressRow}>
            <View style={st.progressBar}><View style={[st.progressFill, { width: totalLegs > 0 ? `${(completedLegs / totalLegs) * 100}%` : "0%" }]} /></View>
            <Text style={st.progressText}>{completedLegs}/{totalLegs}</Text>
          </View>
        )}
      </View>
      <ConnectivityBanner />
      {loading && !bundle ? (
        <View style={st.center}><ActivityIndicator size="large" color="#3478C6" /></View>
      ) : !currentJobId ? (
        <View style={st.center}>
          <MaterialIcons name="work-outline" size={64} color="#C7C7CC" />
          <Text style={st.emptyText}>No active job</Text>
          <Text style={st.emptySubtext}>Go to Run Sheets tab to select a job</Text>
        </View>
      ) : (
        <FlatList
          data={bundle?.legs || []}
          keyExtractor={(item) => item.name}
          renderItem={renderLeg}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={st.listContent}
          ListHeaderComponent={nextLeg ? (
            <TouchableOpacity style={st.nextStop} onPress={() => router.push(`/leg/${nextLeg.name}`)} activeOpacity={0.7}>
              <View style={st.nextStopIcon}><MaterialIcons name="navigation" size={20} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.nextStopLabel}>Next Stop</Text>
                <Text style={st.nextStopDest} numberOfLines={1}>{nextLeg.facility_to || nextLeg.drop_address || "—"}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#3478C6" />
            </TouchableOpacity>
          ) : null}
          ListFooterComponent={allDone && bundle?.doc.status !== "Completed" ? (
            <TouchableOpacity style={st.completeBtn} onPress={handleCompleteJob}>
              <MaterialIcons name="check-circle" size={20} color="#fff" />
              <Text style={st.completeBtnText}>Complete Job</Text>
            </TouchableOpacity>
          ) : null}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerName: { fontSize: 20, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  clockBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  clockText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: "#fff", borderRadius: 3 },
  progressText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#8E8E93" },
  emptySubtext: { fontSize: 14, color: "#C7C7CC" },
  listContent: { padding: 16, paddingBottom: 100 },
  nextStop: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, gap: 12, borderLeftWidth: 4, borderLeftColor: "#3478C6" },
  nextStopIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#3478C6", justifyContent: "center", alignItems: "center" },
  nextStopLabel: { fontSize: 12, color: "#8E8E93" },
  nextStopDest: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  legCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8, gap: 10 },
  legDot: { width: 10, height: 10, borderRadius: 5 },
  legInfo: { flex: 1 },
  legIdx: { fontSize: 12, color: "#8E8E93" },
  legRoute: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  completeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#34C759", paddingVertical: 16, borderRadius: 12, marginTop: 16 },
  completeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
