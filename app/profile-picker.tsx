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
        <Text style={st.profileHost}>{item.siteUrl.replace(/https?:\/\//, "")}</Text>
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
