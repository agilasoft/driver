import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Switch,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuth } from "@/lib/auth-context";
import {
  type DriverProfile,
  getProfileById,
  updateProfile,
  hashPin,
  checkBiometricAvailability,
} from "@/lib/profile-manager";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const FG = "#1A1A1A";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const SURFACE = "#F5F5F7";

export default function EditProfileScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const router = useRouter();
  const { loadProfiles, activeProfile } = useAuth();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [useBiometric, setUseBiometric] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioType, setBioType] = useState<"face" | "fingerprint" | "none">("none");
  const [showSecrets, setShowSecrets] = useState(false);
  const [pinMode, setPinMode] = useState<"keep" | "change" | "remove">("keep");

  useEffect(() => {
    (async () => {
      if (!profileId) {
        setLoading(false);
        return;
      }
      const p = await getProfileById(profileId);
      if (p) {
        setProfile(p);
        setSiteUrl(p.siteUrl);
        setApiKey(p.apiKey);
        setApiSecret(p.apiSecret);
        setUseBiometric(p.useBiometric);
      }
      const bio = await checkBiometricAvailability();
      setBioAvailable(bio.available);
      setBioType(bio.type);
      setLoading(false);
    })();
  }, [profileId]);

  const handleSave = useCallback(async () => {
    if (!profile) return;

    // Validate
    if (!siteUrl.trim()) {
      Alert.alert("Error", "Server URL is required.");
      return;
    }
    if (!apiKey.trim()) {
      Alert.alert("Error", "API Key is required.");
      return;
    }
    if (!apiSecret.trim()) {
      Alert.alert("Error", "API Secret is required.");
      return;
    }

    // PIN validation
    if (pinMode === "change") {
      if (newPin.length < 4 || newPin.length > 6) {
        Alert.alert("Error", "PIN must be 4-6 digits.");
        return;
      }
      if (newPin !== confirmPin) {
        Alert.alert("Error", "PINs do not match.");
        return;
      }
    }

    setSaving(true);
    try {
      const updates: Partial<DriverProfile> = {
        siteUrl: siteUrl.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        useBiometric,
        label: `${profile.fullName || profile.userName} — ${(() => { try { return new URL(siteUrl.trim()).hostname; } catch { return siteUrl.trim(); } })()}`,
      };

      if (pinMode === "change") {
        updates.pin = hashPin(newPin);
      } else if (pinMode === "remove") {
        updates.pin = undefined;
      }

      await updateProfile(profile.id, updates);
      await loadProfiles();

      Alert.alert("Saved", "Profile updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }, [profile, siteUrl, apiKey, apiSecret, useBiometric, pinMode, newPin, confirmPin, loadProfiles, router]);

  if (loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
        <View style={st.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
        <View style={st.center}>
          <Text style={{ color: GRAY, fontSize: 16 }}>Profile not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const getInitials = (name: string) =>
    (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().substring(0, 2);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={st.container}>
        {/* Header */}
        <LinearGradient
          colors={[BLUE, BLUE_LIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={st.header}
        >
          <TouchableOpacity
            style={st.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        <ScrollView
          style={st.scrollView}
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile identity */}
          <View style={st.identitySection}>
            <View style={[st.avatar, { backgroundColor: profile.avatarColor }]}>
              <Text style={st.avatarText}>{getInitials(profile.fullName || profile.userName || "?")}</Text>
            </View>
            <Text style={st.identityName}>{profile.fullName || profile.userName}</Text>
            {profile.driverName ? (
              <Text style={st.identityDriver}>{profile.driverName}</Text>
            ) : null}
          </View>

          {/* Server Configuration */}
          <Text style={st.sectionTitle}>Server Configuration</Text>
          <View style={st.card}>
            <View style={st.fieldRow}>
              <MaterialIcons name="dns" size={18} color={GRAY} style={st.fieldIcon} />
              <View style={st.fieldContent}>
                <Text style={st.fieldLabel}>Server URL</Text>
                <TextInput
                  style={st.fieldInput}
                  value={siteUrl}
                  onChangeText={setSiteUrl}
                  placeholder="https://your-site.erpnext.com"
                  placeholderTextColor="#C7C7CC"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            </View>

            <View style={st.divider} />

            <View style={st.fieldRow}>
              <MaterialIcons name="vpn-key" size={18} color={GRAY} style={st.fieldIcon} />
              <View style={st.fieldContent}>
                <Text style={st.fieldLabel}>API Key</Text>
                <TextInput
                  style={st.fieldInput}
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="API Key"
                  placeholderTextColor="#C7C7CC"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showSecrets}
                />
              </View>
            </View>

            <View style={st.divider} />

            <View style={st.fieldRow}>
              <MaterialIcons name="lock" size={18} color={GRAY} style={st.fieldIcon} />
              <View style={st.fieldContent}>
                <Text style={st.fieldLabel}>API Secret</Text>
                <TextInput
                  style={st.fieldInput}
                  value={apiSecret}
                  onChangeText={setApiSecret}
                  placeholder="API Secret"
                  placeholderTextColor="#C7C7CC"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showSecrets}
                />
              </View>
            </View>

            <View style={st.divider} />

            <TouchableOpacity
              style={st.toggleRow}
              onPress={() => setShowSecrets(!showSecrets)}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={showSecrets ? "visibility-off" : "visibility"}
                size={18}
                color={BLUE}
              />
              <Text style={st.toggleText}>
                {showSecrets ? "Hide credentials" : "Show credentials"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Security */}
          <Text style={st.sectionTitle}>Security</Text>
          <View style={st.card}>
            {/* PIN section */}
            <View style={st.fieldRow}>
              <MaterialIcons name="pin" size={18} color={GRAY} style={st.fieldIcon} />
              <View style={st.fieldContent}>
                <Text style={st.fieldLabel}>PIN Lock</Text>
                <Text style={st.fieldHint}>
                  {profile.pin ? "PIN is set" : "No PIN set"}
                </Text>
              </View>
            </View>

            <View style={st.pinActions}>
              {profile.pin ? (
                <>
                  <TouchableOpacity
                    style={[st.pinActionBtn, pinMode === "keep" && st.pinActionActive]}
                    onPress={() => setPinMode("keep")}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.pinActionText, pinMode === "keep" && st.pinActionTextActive]}>
                      Keep
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.pinActionBtn, pinMode === "change" && st.pinActionActive]}
                    onPress={() => setPinMode("change")}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.pinActionText, pinMode === "change" && st.pinActionTextActive]}>
                      Change
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.pinActionBtn, pinMode === "remove" && st.pinActionActive]}
                    onPress={() => setPinMode("remove")}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.pinActionText, pinMode === "remove" && st.pinActionTextActive]}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[st.pinActionBtn, pinMode === "keep" && st.pinActionActive]}
                    onPress={() => setPinMode("keep")}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.pinActionText, pinMode === "keep" && st.pinActionTextActive]}>
                      No PIN
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.pinActionBtn, pinMode === "change" && st.pinActionActive]}
                    onPress={() => setPinMode("change")}
                    activeOpacity={0.7}
                  >
                    <Text style={[st.pinActionText, pinMode === "change" && st.pinActionTextActive]}>
                      Set PIN
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {pinMode === "change" ? (
              <View style={st.pinInputs}>
                <TextInput
                  style={st.pinField}
                  value={newPin}
                  onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ""))}
                  placeholder="New PIN (4-6 digits)"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                />
                <TextInput
                  style={st.pinField}
                  value={confirmPin}
                  onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, ""))}
                  placeholder="Confirm PIN"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                />
              </View>
            ) : null}

            <View style={st.divider} />

            {/* Biometric */}
            <View style={st.switchRow}>
              <MaterialIcons
                name={bioType === "face" ? "face" : "fingerprint"}
                size={18}
                color={GRAY}
                style={st.fieldIcon}
              />
              <View style={st.fieldContent}>
                <Text style={st.fieldLabel}>
                  {bioType === "face" ? "Face ID" : "Fingerprint"}
                </Text>
                <Text style={st.fieldHint}>
                  {bioAvailable
                    ? "Use biometric to unlock this profile"
                    : "Not available on this device"}
                </Text>
              </View>
              <Switch
                value={useBiometric}
                onValueChange={setUseBiometric}
                disabled={!bioAvailable}
                trackColor={{ false: "#E5E5EA", true: BLUE }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={st.saveBtn}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={st.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },

  // Identity
  identitySection: { alignItems: "center", paddingVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: "center", alignItems: "center", marginBottom: 12,
  },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  identityName: { fontSize: 20, fontWeight: "700", color: FG },
  identityDriver: { fontSize: 14, color: BLUE, marginTop: 4, fontWeight: "500" },

  // Section
  sectionTitle: {
    fontSize: 13, fontWeight: "600", color: GRAY,
    textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },

  // Card
  card: {
    marginHorizontal: 16, borderRadius: 12, backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
    overflow: "hidden",
  },

  // Field rows
  fieldRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
  },
  fieldIcon: { marginRight: 12 },
  fieldContent: { flex: 1 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: GRAY, marginBottom: 4 },
  fieldInput: {
    fontSize: 15, color: FG, padding: 0, margin: 0,
    height: 24,
  },
  fieldHint: { fontSize: 13, color: GRAY },

  divider: { height: 1, backgroundColor: BORDER, marginLeft: 46 },

  // Toggle
  toggleRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 16, gap: 8,
  },
  toggleText: { fontSize: 14, color: BLUE, fontWeight: "500" },

  // PIN actions
  pinActions: {
    flexDirection: "row", paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  pinActionBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER,
  },
  pinActionActive: { backgroundColor: BLUE, borderColor: BLUE },
  pinActionText: { fontSize: 13, fontWeight: "600", color: GRAY },
  pinActionTextActive: { color: "#fff" },

  pinInputs: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  pinField: {
    height: 48, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE, paddingHorizontal: 16,
    fontSize: 18, textAlign: "center", letterSpacing: 6, fontWeight: "600", color: FG,
  },

  // Switch row
  switchRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
  },

  // Save button
  saveBtn: {
    marginHorizontal: 16, marginTop: 24, height: 52, borderRadius: 12,
    backgroundColor: ORANGE, justifyContent: "center", alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
      web: { shadowColor: ORANGE, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
    }),
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
