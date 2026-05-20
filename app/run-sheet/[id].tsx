import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, StatusBar } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getCachedBundle, refreshBundle, applyLocalStatusChange, addPendingStatusChange } from "@/lib/offline-store";
import { updateRunSheetStatus } from "@/lib/frappe-api";
import { useCurrentJob } from "@/lib/current-job";
import { useSync } from "@/lib/sync-context";
import { StatusBadge } from "@/components/status-badge";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";

export default function RunSheetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { currentJobId, setCurrentJob } = useCurrentJob();
  const { refreshPendingCount } = useSync();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    const cached = await getCachedBundle(id);
    if (cached) setBundle(cached);
    try { const fresh = await refreshBundle(id); setBundle(fresh); } catch { /* use cached */ }
  }, [id]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!id) return;
    try {
      await updateRunSheetStatus(id, newStatus);
      await applyLocalStatusChange(id, newStatus);
      await loadData();
    } catch {
      await addPendingStatusChange({ runSheetName: id, status: newStatus, timestamp: new Date().toISOString() });
      await applyLocalStatusChange(id, newStatus);
      await loadData();
      await refreshPendingCount();
    }
  }, [id, loadData, refreshPendingCount]);

  const renderLeg = ({ item }: { item: TransportLeg }) => {
    const isDone = item.status === "Completed" || item.status === "Done";
    return (
      <TouchableOpacity style={st.legCard} onPress={() => router.push(`/leg/${item.name}`)} activeOpacity={0.7}>
        <View style={[st.legDot, { backgroundColor: isDone ? "#34C759" : "#E5E5EA" }]} />
        <View style={st.legInfo}>
          <Text style={st.legIdx}>Leg {item.idx}</Text>
          <Text style={st.legRoute} numberOfLines={1}>{item.facility_from || "—"} → {item.facility_to || "—"}</Text>
          {item.cargo_description ? <Text style={st.legCargo} numberOfLines={1}>{item.cargo_description}</Text> : null}
        </View>
        <StatusBadge status={item.status || "Pending"} />
      </TouchableOpacity>
    );
  };

  const status = bundle?.doc.status || "Draft";

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={st.headerSub}>{bundle?.doc.posting_date || ""}</Text>
        </View>
        <StatusBadge status={status} />
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color="#3478C6" /></View>
      ) : (
        <FlatList
          data={bundle?.legs || []}
          keyExtractor={(item) => item.name}
          renderItem={renderLeg}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={st.listContent}
          ListHeaderComponent={
            <View style={st.actions}>
              {status === "Draft" || status === "Dispatched" ? (
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#3478C6" }]} onPress={() => handleStatusChange("In-Progress")}>
                  <MaterialIcons name="play-arrow" size={18} color="#fff" />
                  <Text style={st.actionBtnText}>Start Trip</Text>
                </TouchableOpacity>
              ) : null}
              {status === "In-Progress" ? (
                <>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#34C759" }]} onPress={() => handleStatusChange("Completed")}>
                    <MaterialIcons name="check" size={18} color="#fff" />
                    <Text style={st.actionBtnText}>Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#FF9500" }]} onPress={() => handleStatusChange("Hold")}>
                    <MaterialIcons name="pause" size={18} color="#fff" />
                    <Text style={st.actionBtnText}>Hold</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {status === "Hold" ? (
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#3478C6" }]} onPress={() => handleStatusChange("In-Progress")}>
                  <MaterialIcons name="play-arrow" size={18} color="#fff" />
                  <Text style={st.actionBtnText}>Resume</Text>
                </TouchableOpacity>
              ) : null}
              {currentJobId !== id && status !== "Completed" && status !== "Cancelled" ? (
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: "#F27A2E" }]} onPress={() => setCurrentJob(id || null)}>
                  <MaterialIcons name="star" size={18} color="#fff" />
                  <Text style={st.actionBtnText}>Set Current</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 100 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  legCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8, gap: 10 },
  legDot: { width: 10, height: 10, borderRadius: 5 },
  legInfo: { flex: 1 },
  legIdx: { fontSize: 12, color: "#8E8E93" },
  legRoute: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  legCargo: { fontSize: 12, color: "#C7C7CC", marginTop: 2 },
});
