import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { useCurrentJob } from "@/lib/current-job";
import { getCachedRunSheets, refreshRunSheets } from "@/lib/offline-store";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import type { RunSheet } from "@/lib/types";

const FILTERS = ["All", "Today", "This Week"];

export default function RunSheetsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth } = useAuth();
  const { currentJobId, setCurrentJob } = useCurrentJob();
  const [sheets, setSheets] = useState<RunSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const loadData = useCallback(async () => {
    const cached = await getCachedRunSheets();
    if (cached.length > 0) setSheets(cached);
    try {
      const fresh = await refreshRunSheets(auth?.driverId);
      setSheets(fresh);
    } catch { /* use cached */ }
  }, [auth?.driverId]);

  useEffect(() => { setLoading(true); loadData().finally(() => setLoading(false)); }, [loadData]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const filteredSheets = sheets.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.route?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "Today") {
      const today = new Date().toISOString().split("T")[0];
      return s.posting_date === today;
    }
    if (filter === "This Week") {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
      return s.posting_date >= weekAgo;
    }
    return true;
  });

  const renderSheet = ({ item }: { item: RunSheet }) => {
    const isCurrent = item.name === currentJobId;
    return (
      <TouchableOpacity style={[st.card, isCurrent && st.cardCurrent]} onPress={() => router.push(`/run-sheet/${item.name}`)} activeOpacity={0.7}>
        <View style={st.cardHeader}>
          <Text style={st.cardName}>{item.name}</Text>
          <StatusBadge status={item.status} />
        </View>
        {item.route ? <Text style={st.cardRoute}>{item.route}</Text> : null}
        <View style={st.cardFooter}>
          <Text style={st.cardDate}>{item.posting_date}</Text>
          {!isCurrent && item.status !== "Completed" && item.status !== "Cancelled" ? (
            <TouchableOpacity style={st.setBtn} onPress={() => setCurrentJob(item.name)}>
              <Text style={st.setBtnText}>Set as Current</Text>
            </TouchableOpacity>
          ) : isCurrent ? (
            <View style={st.currentBadge}><Text style={st.currentBadgeText}>Active</Text></View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <Text style={st.headerTitle}>Run Sheets</Text>
        <View style={st.searchRow}>
          <MaterialIcons name="search" size={20} color="rgba(255,255,255,0.6)" />
          <TextInput style={st.searchInput} value={search} onChangeText={setSearch} placeholder="Search..." placeholderTextColor="rgba(255,255,255,0.5)" returnKeyType="done" />
        </View>
      </View>
      <ConnectivityBanner />
      <View style={st.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[st.filterChip, filter === f && st.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[st.filterText, filter === f && st.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading && sheets.length === 0 ? (
        <View style={st.center}><ActivityIndicator size="large" color="#3478C6" /></View>
      ) : (
        <FlatList
          data={filteredSheets}
          keyExtractor={(item) => item.name}
          renderItem={renderSheet}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={st.listContent}
          ListEmptyComponent={<View style={st.center}><Text style={st.emptyText}>No run sheets found</Text></View>}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, height: 38, color: "#fff", fontSize: 15 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#E5E5EA" },
  filterChipActive: { backgroundColor: "#3478C6" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#8E8E93" },
  filterTextActive: { color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: 16, color: "#8E8E93" },
  listContent: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardCurrent: { borderWidth: 2, borderColor: "#3478C6" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  cardRoute: { fontSize: 13, color: "#8E8E93", marginTop: 4 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  cardDate: { fontSize: 12, color: "#C7C7CC" },
  setBtn: { backgroundColor: "#F27A2E", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  setBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  currentBadge: { backgroundColor: "#E3F2FD", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  currentBadgeText: { color: "#3478C6", fontSize: 12, fontWeight: "600" },
});
