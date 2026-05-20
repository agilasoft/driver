#!/usr/bin/env python3
"""Generate all screen files for the Driver app rebuild."""
import os

BASE = "/home/ubuntu/driver"

files = {}

# ─── app/+not-found.tsx ───────────────────────────────────────────────────────
files["app/+not-found.tsx"] = '''
import { Redirect } from "expo-router";

export default function NotFound() {
  return <Redirect href="/profile-picker" />;
}
'''

# ─── app/index.tsx (entry redirect) ──────────────────────────────────────────
files["app/index.tsx"] = '''
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export default function IndexRedirect() {
  const router = useRouter();
  const { isUnlocked } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isUnlocked) {
        router.replace("/(tabs)");
      } else {
        router.replace("/profile-picker");
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isUnlocked, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#3478C6" />
    </View>
  );
}
'''

# ─── app/profile-picker.tsx ───────────────────────────────────────────────────
files["app/profile-picker.tsx"] = '''
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Platform, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import { useSessionTimeout } from "@/lib/session-timeout";
import { authenticateWithBiometric } from "@/lib/profile-manager";
import type { DriverProfile } from "@/lib/types";

export default function ProfilePickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, unlockProfile, reloadProfiles } = useAuth();
  const { resetTimer } = useSessionTimeout();
  const [pinTarget, setPinTarget] = useState<DriverProfile | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  useEffect(() => { reloadProfiles(); }, [reloadProfiles]);

  const handleProfileTap = useCallback(async (profile: DriverProfile) => {
    if (profile.useBiometric) {
      const success = await authenticateWithBiometric();
      if (success) { unlockProfile(profile); resetTimer(); router.replace("/(tabs)"); return; }
    }
    if (profile.pin) { setPinTarget(profile); setPinInput(""); setPinError(""); return; }
    unlockProfile(profile); resetTimer(); router.replace("/(tabs)");
  }, [unlockProfile, resetTimer, router]);

  const handlePinSubmit = useCallback(() => {
    if (!pinTarget) return;
    if (pinInput === pinTarget.pin) {
      unlockProfile(pinTarget); resetTimer(); setPinTarget(null); router.replace("/(tabs)");
    } else { setPinError("Incorrect PIN"); setPinInput(""); }
  }, [pinInput, pinTarget, unlockProfile, resetTimer, router]);

  const renderProfile = ({ item }: { item: DriverProfile }) => (
    <TouchableOpacity style={st.profileCard} onPress={() => handleProfileTap(item)} activeOpacity={0.7}>
      <View style={[st.avatar, { backgroundColor: item.avatarColor }]}>
        <Text style={st.avatarText}>{(item.fullName || item.userName).charAt(0).toUpperCase()}</Text>
      </View>
      <View style={st.profileInfo}>
        <Text style={st.profileName}>{item.fullName || item.userName}</Text>
        <Text style={st.profileHost}>{item.siteUrl.replace(/https?:\\/\\//, "")}</Text>
        {item.driverName ? <Text style={st.profileDriver}>{item.driverName}</Text> : null}
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#C7C7CC" />
    </TouchableOpacity>
  );

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 16 }]}>
        <MaterialIcons name="local-shipping" size={36} color="#fff" />
        <Text style={st.title}>Driver</Text>
        <Text style={st.subtitle}>Select your profile to continue</Text>
      </View>

      {pinTarget ? (
        <View style={st.pinOverlay}>
          <View style={[st.pinHeader, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={() => setPinTarget(null)} style={st.pinBack}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={st.pinTitle}>Enter PIN</Text>
          </View>
          <View style={st.pinBody}>
            <View style={[st.pinAvatar, { backgroundColor: pinTarget.avatarColor }]}>
              <Text style={st.pinAvatarText}>{(pinTarget.fullName || pinTarget.userName).charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={st.pinName}>{pinTarget.fullName}</Text>
            <TextInput
              style={st.pinInput}
              value={pinInput}
              onChangeText={setPinInput}
              placeholder="Enter PIN"
              placeholderTextColor="#999"
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handlePinSubmit}
            />
            {pinError ? <Text style={st.pinErrorText}>{pinError}</Text> : null}
            <TouchableOpacity style={st.pinBtn} onPress={handlePinSubmit}>
              <Text style={st.pinBtnText}>Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={profiles}
            keyExtractor={(item) => item.id}
            renderItem={renderProfile}
            contentContainerStyle={st.list}
            ListEmptyComponent={
              <View style={st.empty}>
                <MaterialIcons name="person-add" size={48} color="#C7C7CC" />
                <Text style={st.emptyText}>No profiles yet</Text>
                <Text style={st.emptySubtext}>Tap + to add your first driver profile</Text>
              </View>
            }
          />
          <TouchableOpacity style={st.fab} onPress={() => router.push("/login")} activeOpacity={0.8}>
            <MaterialIcons name="add" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={[st.footer, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={st.footerText}>Powered by Agilasoft Cloud Technologies Inc.</Text>
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 24, paddingBottom: 24, alignItems: "center", gap: 4 },
  title: { fontSize: 28, fontWeight: "800", color: "#fff", marginTop: 8 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  list: { padding: 16, paddingBottom: 100 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 20, fontWeight: "700", color: "#fff" },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  profileHost: { fontSize: 13, color: "#8E8E93", marginTop: 2 },
  profileDriver: { fontSize: 12, color: "#3478C6", marginTop: 2 },
  fab: { position: "absolute", bottom: 80, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#F27A2E", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  footer: { alignItems: "center", paddingVertical: 8 },
  footerText: { fontSize: 11, color: "#8E8E93" },
  empty: { alignItems: "center", paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#8E8E93" },
  emptySubtext: { fontSize: 14, color: "#C7C7CC" },
  pinOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#F5F5F7", zIndex: 100 },
  pinHeader: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  pinBack: { padding: 4 },
  pinTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  pinBody: { flex: 1, alignItems: "center", paddingTop: 48, paddingHorizontal: 32 },
  pinAvatar: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  pinAvatarText: { fontSize: 28, fontWeight: "700", color: "#fff" },
  pinName: { fontSize: 18, fontWeight: "600", color: "#1A1A1A", marginBottom: 24 },
  pinInput: { width: "100%", height: 52, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, fontSize: 24, textAlign: "center", letterSpacing: 8, borderWidth: 1, borderColor: "#E5E5EA" },
  pinErrorText: { color: "#FF3B30", fontSize: 14, marginTop: 8 },
  pinBtn: { marginTop: 24, backgroundColor: "#3478C6", paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12 },
  pinBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
'''

# ─── app/login.tsx ────────────────────────────────────────────────────────────
files["app/login.tsx"] = '''
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { configureFrappeApi, testConnection, getLinkedDriver } from "@/lib/frappe-api";
import { addProfile } from "@/lib/profile-manager";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reloadProfiles } = useAuth();
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [testResult, setTestResult] = useState<{ userName: string; fullName: string; driverName: string; driverId: string } | null>(null);

  const handleTest = async () => {
    if (!siteUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const url = siteUrl.trim().replace(/\\/+$/, "");
      configureFrappeApi(url, apiKey.trim(), apiSecret.trim());
      const { userName, fullName } = await testConnection();
      const { driverName, driverId } = await getLinkedDriver(userName);
      setTestResult({ userName, fullName, driverName, driverId });
      setStep(2);
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message || "Could not connect to server.");
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!testResult) return;
    setLoading(true);
    try {
      await addProfile({
        siteUrl: siteUrl.trim().replace(/\\/+$/, ""),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        userName: testResult.userName,
        fullName: testResult.fullName,
        driverName: testResult.driverName,
        driverId: testResult.driverId,
      });
      await reloadProfiles();
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save profile.");
    } finally { setLoading(false); }
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Add Profile</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={st.body}>
          {step === 1 ? (
            <>
              <Text style={st.label}>Server URL</Text>
              <TextInput style={st.input} value={siteUrl} onChangeText={setSiteUrl} placeholder="https://your-site.frappe.cloud" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <Text style={st.label}>API Key</Text>
              <TextInput style={st.input} value={apiKey} onChangeText={setApiKey} placeholder="API Key" autoCapitalize="none" autoCorrect={false} />
              <Text style={st.label}>API Secret</Text>
              <TextInput style={st.input} value={apiSecret} onChangeText={setApiSecret} placeholder="API Secret" secureTextEntry autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={st.btn} onPress={handleTest} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Test Connection</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={st.successCard}>
                <MaterialIcons name="check-circle" size={48} color="#34C759" />
                <Text style={st.successTitle}>Connected!</Text>
                <Text style={st.successText}>User: {testResult?.fullName}</Text>
                {testResult?.driverName ? <Text style={st.successText}>Driver: {testResult.driverName}</Text> : <Text style={st.warningText}>No linked Driver record found</Text>}
              </View>
              <TouchableOpacity style={st.btn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Save Profile</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={st.secondaryBtn} onPress={() => setStep(1)}>
                <Text style={st.secondaryBtnText}>Back to Edit</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  body: { padding: 24, gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#1A1A1A", marginTop: 8 },
  input: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, borderWidth: 1, borderColor: "#E5E5EA" },
  btn: { backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { paddingVertical: 12, alignItems: "center", marginTop: 12 },
  secondaryBtnText: { color: "#3478C6", fontSize: 14, fontWeight: "600" },
  successCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", gap: 8, marginVertical: 24 },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#1A1A1A" },
  successText: { fontSize: 15, color: "#8E8E93" },
  warningText: { fontSize: 14, color: "#FF9500", marginTop: 4 },
});
'''

# ─── app/(tabs)/_layout.tsx ───────────────────────────────────────────────────
files["app/(tabs)/_layout.tsx"] = '''
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Current Job",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="run-sheets"
        options={{
          title: "Run Sheets",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chevron.left.forwardslash.chevron.right" color={color} />,
        }}
      />
    </Tabs>
  );
}
'''

# ─── app/(tabs)/index.tsx (Current Job) ──────────────────────────────────────
files["app/(tabs)/index.tsx"] = '''
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
  const { isClocked, elapsedMs, clockIn, clockOut } = useShiftLog();
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
'''

# ─── app/(tabs)/run-sheets.tsx ────────────────────────────────────────────────
files["app/(tabs)/run-sheets.tsx"] = '''
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
'''

# ─── app/(tabs)/settings.tsx ──────────────────────────────────────────────────
files["app/(tabs)/settings.tsx"] = '''
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
  const { isEnabled: liveEnabled, setEnabled: setLiveEnabled } = useLiveLocation();
  const { pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const { isClocked, elapsedMs } = useShiftLog();
  const [showPinSetup, setShowPinSetup] = useState(false);

  const handleSetPin = () => {
    Alert.prompt?.("Set PIN", "Enter a 4-6 digit PIN:", [
      { text: "Cancel", style: "cancel" },
      { text: "Set", onPress: (pin) => { if (pin && pin.length >= 4 && activeProfile) updateProfilePin(activeProfile.id, pin); } },
    ], "secure-text") || Alert.alert("PIN", "Use device settings to set a PIN.");
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
'''

# ─── app/run-sheet/[id].tsx ───────────────────────────────────────────────────
files["app/run-sheet/[id].tsx"] = '''
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
'''

# ─── app/leg/[legId].tsx ──────────────────────────────────────────────────────
files["app/leg/[legId].tsx"] = '''
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, StatusBar, Linking, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getCachedBundle, applyLocalChange, addPendingChange } from "@/lib/offline-store";
import { updateLegFields } from "@/lib/frappe-api";
import { useLocationCapture } from "@/hooks/use-location";
import { useSync } from "@/lib/sync-context";
import type { TransportLeg, RunSheetBundle } from "@/lib/types";

export default function LegDetailScreen() {
  const router = useRouter();
  const { legId } = useLocalSearchParams<{ legId: string }>();
  const insets = useSafeAreaInsets();
  const { captureLocation, isCapturing } = useLocationCapture();
  const { refreshPendingCount } = useSync();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [leg, setLeg] = useState<TransportLeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [pickSignedBy, setPickSignedBy] = useState("");
  const [dropSignedBy, setDropSignedBy] = useState("");
  const [pickNotes, setPickNotes] = useState("");
  const [dropNotes, setDropNotes] = useState("");
  const [pickLat, setPickLat] = useState<number | undefined>();
  const [pickLng, setPickLng] = useState<number | undefined>();
  const [dropLat, setDropLat] = useState<number | undefined>();
  const [dropLng, setDropLng] = useState<number | undefined>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = useCallback(async () => {
    if (!legId) return;
    // Find the leg in cached bundles
    const keys = await (await import("@react-native-async-storage/async-storage")).default.getAllKeys();
    for (const key of keys) {
      if (!key.startsWith("offline_bundle_")) continue;
      const raw = await (await import("@react-native-async-storage/async-storage")).default.getItem(key);
      if (!raw) continue;
      const b: RunSheetBundle = JSON.parse(raw);
      const found = b.legs.find((l) => l.name === legId);
      if (found) { setBundle(b); setLeg(found); initFields(found); break; }
    }
  }, [legId]);

  const initFields = (l: TransportLeg) => {
    setPickSignedBy(l.pick_signed_by || "");
    setDropSignedBy(l.drop_signed_by || "");
    setPickNotes(l.pick_notes || "");
    setDropNotes(l.drop_notes || "");
    setPickLat(l.pick_latitude);
    setPickLng(l.pick_longitude);
    setDropLat(l.drop_latitude);
    setDropLng(l.drop_longitude);
    setStartDate(l.start_date || "");
    setEndDate(l.end_date || "");
  };

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  const handleCapturePickGps = useCallback(async () => {
    const coords = await captureLocation();
    if (coords) { setPickLat(coords.latitude); setPickLng(coords.longitude); }
  }, [captureLocation]);

  const handleCaptureDropGps = useCallback(async () => {
    const coords = await captureLocation();
    if (coords) { setDropLat(coords.latitude); setDropLng(coords.longitude); }
  }, [captureLocation]);

  const handleStampPickTime = () => setStartDate(new Date().toISOString());
  const handleStampDropTime = () => setEndDate(new Date().toISOString());

  const openNavigation = (lat?: number, lng?: number, address?: string) => {
    if (lat && lng) {
      const url = Platform.OS === "ios" ? `maps:?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
      Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
    } else if (address) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`);
    }
  };

  const handleSave = useCallback(async () => {
    if (!leg || !bundle) return;
    setSaving(true);
    const changes: Partial<TransportLeg> = {
      pick_signed_by: pickSignedBy,
      drop_signed_by: dropSignedBy,
      pick_notes: pickNotes,
      drop_notes: dropNotes,
      pick_latitude: pickLat,
      pick_longitude: pickLng,
      drop_latitude: dropLat,
      drop_longitude: dropLng,
      start_date: startDate,
      end_date: endDate,
    };
    try {
      await updateLegFields(leg.name, changes);
      await applyLocalChange(bundle.doc.name, leg.name, changes);
      Alert.alert("Saved", "Leg updated successfully.");
    } catch {
      await addPendingChange({
        id: `${leg.name}_${Date.now()}`,
        legName: leg.name,
        runSheetName: bundle.doc.name,
        timestamp: new Date().toISOString(),
        changes,
        synced: false,
      });
      await applyLocalChange(bundle.doc.name, leg.name, changes);
      await refreshPendingCount();
      Alert.alert("Saved Offline", "Changes will sync when online.");
    } finally { setSaving(false); }
  }, [leg, bundle, pickSignedBy, dropSignedBy, pickNotes, dropNotes, pickLat, pickLng, dropLat, dropLng, startDate, endDate, refreshPendingCount]);

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color="#3478C6" /></View>;
  if (!leg) return <View style={st.center}><Text>Leg not found</Text></View>;

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Leg {leg.idx}</Text>
          <Text style={st.headerSub}>{leg.facility_from || "—"} → {leg.facility_to || "—"}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={st.body}>
        {/* Route */}
        <View style={st.routeCard}>
          <View style={st.routeRow}>
            <View style={[st.routeDot, { backgroundColor: "#3478C6" }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.routeLabel}>Pick-up</Text>
              <Text style={st.routeAddr}>{leg.pick_address || leg.facility_from || "—"}</Text>
            </View>
            <TouchableOpacity style={st.navBtn} onPress={() => openNavigation(pickLat, pickLng, leg.pick_address || leg.facility_from)}>
              <MaterialIcons name="navigation" size={18} color="#3478C6" />
            </TouchableOpacity>
          </View>
          <View style={st.routeDivider} />
          <View style={st.routeRow}>
            <View style={[st.routeDot, { backgroundColor: "#F27A2E" }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.routeLabel}>Drop-off</Text>
              <Text style={st.routeAddr}>{leg.drop_address || leg.facility_to || "—"}</Text>
            </View>
            <TouchableOpacity style={st.navBtn} onPress={() => openNavigation(dropLat, dropLng, leg.drop_address || leg.facility_to)}>
              <MaterialIcons name="navigation" size={18} color="#F27A2E" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pick-up Section */}
        <Text style={st.sectionTitle}>Pick-up</Text>
        <View style={st.fieldCard}>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Timestamp</Text>
            <TouchableOpacity style={st.stampBtn} onPress={handleStampPickTime}>
              <Text style={st.stampBtnText}>{startDate ? new Date(startDate).toLocaleString() : "Stamp Now"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>GPS</Text>
            <TouchableOpacity style={st.gpsBtn} onPress={handleCapturePickGps} disabled={isCapturing}>
              <MaterialIcons name="my-location" size={16} color="#3478C6" />
              <Text style={st.gpsBtnText}>{pickLat ? `${pickLat.toFixed(5)}, ${pickLng?.toFixed(5)}` : "Capture"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Signed By</Text>
            <TextInput style={st.fieldInput} value={pickSignedBy} onChangeText={setPickSignedBy} placeholder="Name" returnKeyType="done" />
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Notes</Text>
            <TextInput style={[st.fieldInput, { height: 60 }]} value={pickNotes} onChangeText={setPickNotes} placeholder="Notes..." multiline returnKeyType="done" />
          </View>
          <TouchableOpacity style={st.sigBtn} onPress={() => router.push({ pathname: "/signature-modal", params: { legId: leg.name, type: "pick" } })}>
            <MaterialIcons name="draw" size={18} color="#3478C6" />
            <Text style={st.sigBtnText}>{leg.pick_signature ? "View Signature" : "Capture Signature"}</Text>
          </TouchableOpacity>
        </View>

        {/* Drop-off Section */}
        <Text style={st.sectionTitle}>Drop-off</Text>
        <View style={st.fieldCard}>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Timestamp</Text>
            <TouchableOpacity style={st.stampBtn} onPress={handleStampDropTime}>
              <Text style={st.stampBtnText}>{endDate ? new Date(endDate).toLocaleString() : "Stamp Now"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>GPS</Text>
            <TouchableOpacity style={st.gpsBtn} onPress={handleCaptureDropGps} disabled={isCapturing}>
              <MaterialIcons name="my-location" size={16} color="#F27A2E" />
              <Text style={st.gpsBtnText}>{dropLat ? `${dropLat.toFixed(5)}, ${dropLng?.toFixed(5)}` : "Capture"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Signed By</Text>
            <TextInput style={st.fieldInput} value={dropSignedBy} onChangeText={setDropSignedBy} placeholder="Name" returnKeyType="done" />
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Notes</Text>
            <TextInput style={[st.fieldInput, { height: 60 }]} value={dropNotes} onChangeText={setDropNotes} placeholder="Notes..." multiline returnKeyType="done" />
          </View>
          <TouchableOpacity style={st.sigBtn} onPress={() => router.push({ pathname: "/signature-modal", params: { legId: leg.name, type: "drop" } })}>
            <MaterialIcons name="draw" size={18} color="#F27A2E" />
            <Text style={st.sigBtnText}>{leg.drop_signature ? "View Signature" : "Capture Signature"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[st.saveBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={st.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <><MaterialIcons name="save" size={20} color="#fff" /><Text style={st.saveBtnText}>Save Changes</Text></>
          )}
        </TouchableOpacity>
      </View>
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
  body: { padding: 16, paddingBottom: 120 },
  routeCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeLabel: { fontSize: 12, color: "#8E8E93" },
  routeAddr: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  routeDivider: { width: 2, height: 20, backgroundColor: "#E5E5EA", marginLeft: 5, marginVertical: 4 },
  navBtn: { padding: 8, backgroundColor: "#E3F2FD", borderRadius: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", marginBottom: 8, marginTop: 8 },
  fieldCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, gap: 12 },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 13, color: "#8E8E93", width: 80 },
  fieldInput: { flex: 1, backgroundColor: "#F5F5F7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, textAlignVertical: "top" },
  stampBtn: { backgroundColor: "#E3F2FD", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  stampBtnText: { color: "#3478C6", fontSize: 13, fontWeight: "600" },
  gpsBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F5F5F7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  gpsBtnText: { color: "#3478C6", fontSize: 13, fontWeight: "500" },
  sigBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: "#F0F0F0", marginTop: 4 },
  sigBtnText: { color: "#3478C6", fontSize: 14, fontWeight: "600" },
  saveBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#E5E5EA" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
'''

# ─── app/signature-modal.tsx ──────────────────────────────────────────────────
files["app/signature-modal.tsx"] = '''
import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

export default function SignatureModal() {
  const router = useRouter();
  const { legId, type } = useLocalSearchParams<{ legId: string; type: string }>();
  const insets = useSafeAreaInsets();
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState("");

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart((e) => { setCurrentPath(`M${e.x},${e.y}`); })
    .onUpdate((e) => { setCurrentPath((prev) => prev + ` L${e.x},${e.y}`); })
    .onEnd(() => { setPaths((prev) => [...prev, currentPath]); setCurrentPath(""); });

  const handleClear = () => { setPaths([]); setCurrentPath(""); };
  const handleSave = () => {
    // In a real app, we would capture the SVG as an image and save it
    Alert.alert("Signature Captured", "Signature saved for " + type + " on leg " + legId);
    router.back();
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <MaterialIcons name="close" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={st.title}>{type === "pick" ? "Pick-up" : "Drop-off"} Signature</Text>
        <TouchableOpacity onPress={handleClear}>
          <Text style={st.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={panGesture}>
        <View style={st.canvas}>
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((d, i) => <Path key={i} d={d} stroke="#1A1A1A" strokeWidth={3} fill="none" strokeLinecap="round" />)}
            {currentPath ? <Path d={currentPath} stroke="#1A1A1A" strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
          </Svg>
          {paths.length === 0 && !currentPath && (
            <Text style={st.placeholder}>Sign here</Text>
          )}
        </View>
      </GestureDetector>
      <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={st.saveBtn} onPress={handleSave}>
          <Text style={st.saveBtnText}>Save Signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#E5E5EA" },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "600", color: "#1A1A1A" },
  clearText: { fontSize: 15, color: "#FF3B30", fontWeight: "600" },
  canvas: { flex: 1, margin: 16, borderWidth: 1, borderColor: "#E5E5EA", borderRadius: 12, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  placeholder: { fontSize: 18, color: "#C7C7CC" },
  footer: { paddingHorizontal: 16, paddingTop: 12 },
  saveBtn: { backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
'''

# ─── app/barcode-scanner.tsx ──────────────────────────────────────────────────
files["app/barcode-scanner.tsx"] = '''
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function BarcodeScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={st.title}>Scan Barcode</Text>
      </View>
      <View style={st.body}>
        <MaterialIcons name="qr-code-scanner" size={80} color="#C7C7CC" />
        <Text style={st.text}>Camera barcode scanning requires a native build.</Text>
        <Text style={st.subtext}>Use Expo Go on your device to test this feature.</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "600", color: "#fff" },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 32 },
  text: { fontSize: 16, color: "#fff", textAlign: "center" },
  subtext: { fontSize: 14, color: "#8E8E93", textAlign: "center" },
});
'''

for path, content in files.items():
    full_path = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content.strip() + '\\n')
    print(f'OK: {path}')
