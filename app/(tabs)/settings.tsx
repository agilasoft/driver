import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { useSessionTimeout, TIMEOUT_OPTIONS } from "@/lib/session-timeout";
import { useLiveLocation } from "@/lib/live-location";
import { useSync } from "@/lib/sync-context";
import { useShiftLog, formatDuration } from "@/lib/shift-log";

export default function SettingsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, activeProfile, lockProfile, signOut, updateProfilePin } = useAuth();
  const { timeoutMinutes, setTimeoutMinutes } = useSessionTimeout();
  const liveCtx = useLiveLocation();
  const liveEnabled = liveCtx?.isEnabled ?? false;
  const setLiveEnabled = liveCtx?.setEnabled ?? (async (_: boolean) => {});
  const { pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const shiftCtx = useShiftLog();
  const isClocked = shiftCtx?.isClocked ?? false;
  const elapsedMs = shiftCtx?.elapsedMs ?? 0;
  const [showPinSetup, setShowPinSetup] = useState(false);

  const handleSetPin = () => {
    Alert.alert("Set PIN", "PIN setup is available in profile settings.");
  };

  const handleLock = () => { lockProfile(); router.replace("/profile-picker"); };
  const handleSignOut = () => {
    Alert.alert("Sign Out", "Remove this profile from the device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await signOut(); router.replace("/profile-picker"); } },
    ]);
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <Text style={st.headerTitle}>Settings</Text>
        <Text style={st.headerSub}>{auth?.fullName || "Driver"}</Text>
      </View>
      <ScrollView contentContainerStyle={st.body}>
        <Text style={st.sectionTitle}>Session</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Auto-lock after</Text>
            <View style={st.chipRow}>
              {TIMEOUT_OPTIONS.map((m) => (
                <TouchableOpacity key={m} style={[st.chip, timeoutMinutes === m && st.chipActive]} onPress={() => setTimeoutMinutes(m)}>
                  <Text style={[st.chipText, timeoutMinutes === m && st.chipTextActive]}>{m === 0 ? "Never" : m + "m"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <Text style={st.sectionTitle}>Location</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Live Location Sharing</Text>
            <Switch value={liveEnabled} onValueChange={setLiveEnabled} trackColor={{ true: "#3478C6" }} />
          </View>
        </View>

        <Text style={st.sectionTitle}>Sync</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Pending Changes</Text>
            <Text style={st.rowValue}>{pendingCount}</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>Last Sync</Text>
            <Text style={st.rowValue}>{lastSync ? new Date(lastSync).toLocaleTimeString() : "Never"}</Text>
          </View>
          <TouchableOpacity style={st.syncBtn} onPress={syncNow} disabled={isSyncing}>
            <MaterialIcons name="sync" size={18} color="#3478C6" />
            <Text style={st.syncBtnText}>{isSyncing ? "Syncing..." : "Sync Now"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={st.sectionTitle}>Shift</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Status</Text>
            <Text style={[st.rowValue, { color: isClocked ? "#34C759" : "#8E8E93" }]}>{isClocked ? "Clocked In" : "Off"}</Text>
          </View>
          {isClocked && (
            <View style={st.row}>
              <Text style={st.rowLabel}>Elapsed</Text>
              <Text style={st.rowValue}>{formatDuration(elapsedMs)}</Text>
            </View>
          )}
        </View>

        <Text style={st.sectionTitle}>Account</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={handleSetPin}>
            <Text style={st.rowLabel}>Set PIN</Text>
            <MaterialIcons name="chevron-right" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={handleLock}>
            <Text style={st.rowLabel}>Lock Profile</Text>
            <MaterialIcons name="lock" size={20} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={handleSignOut}>
            <Text style={[st.rowLabel, { color: "#FF3B30" }]}>Remove Profile</Text>
            <MaterialIcons name="logout" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  body: { padding: 16, paddingBottom: 100 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#8E8E93", textTransform: "uppercase", marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#F0F0F0" },
  rowLabel: { fontSize: 15, color: "#1A1A1A" },
  rowValue: { fontSize: 15, color: "#8E8E93" },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#F0F0F0" },
  chipActive: { backgroundColor: "#3478C6" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#8E8E93" },
  chipTextActive: { color: "#fff" },
  syncBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  syncBtnText: { color: "#3478C6", fontSize: 14, fontWeight: "600" },
});
