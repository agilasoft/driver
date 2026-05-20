import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  StyleSheet,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSync } from "@/lib/sync-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  requestNotificationPermissions,
  startAssignmentPolling,
  stopAssignmentPolling,
} from "@/lib/notifications";
import { checkBiometricAvailability } from "@/lib/profile-manager";
import { useThemeContext, type ThemePreference } from "@/lib/theme-provider";
import { useSessionTimeout, TIMEOUT_OPTIONS } from "@/lib/session-timeout";
import { useLiveLocation, INTERVAL_OPTIONS } from "@/lib/live-location";
import { useGeofence, RADIUS_OPTIONS } from "@/lib/geofence";
import { useShiftLog, formatDuration, formatDurationShort } from "@/lib/shift-log";
import { LinearGradient } from "expo-linear-gradient";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const GREEN = "#34C759";
const RED = "#FF3B30";
const WARN = "#FF9500";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const SURFACE = "#F5F5F7";
const FG = "#1A1A1A";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    auth, logout, updateCredentials, signOut,
    activeProfile, profiles,
    updateProfilePin, updateProfileBiometric, removeProfile,
  } = useAuth();
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const router = useRouter();
  const { themePreference, setThemePreference, colorScheme } = useThemeContext();
  const { timeoutMinutes, setTimeoutMinutes } = useSessionTimeout();
  const { isEnabled: liveLocEnabled, isTracking, lastUpdate, intervalMs, setEnabled: setLiveLocEnabled, setIntervalMs } = useLiveLocation();
  const { isEnabled: geoEnabled, isMonitoring: geoMonitoring, radiusM, recentAlerts, setEnabled: setGeoEnabled, setRadiusM } = useGeofence();
  const { isClocked, elapsedMs, todayShifts, totalTodayMs, clockIn, clockOut, syncShifts } = useShiftLog();
  const params = useLocalSearchParams<{
    scannedSiteUrl?: string;
    scannedApiKey?: string;
    scannedApiSecret?: string;
  }>();
  const [notifEnabled, setNotifEnabled] = useState(false);

  const [configExpanded, setConfigExpanded] = useState(false);
  const [editSiteUrl, setEditSiteUrl] = useState(auth?.siteUrl || "");
  const [editApiKey, setEditApiKey] = useState(auth?.apiKey || "");
  const [editApiSecret, setEditApiSecret] = useState(auth?.apiSecret || "");
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [pinSetup, setPinSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioType, setBioType] = useState("");

  useEffect(() => {
    if (auth) {
      setEditSiteUrl(auth.siteUrl);
      setEditApiKey(auth.apiKey);
      setEditApiSecret(auth.apiSecret);
    }
  }, [auth?.siteUrl, auth?.apiKey, auth?.apiSecret]);

  useEffect(() => {
    if (params.scannedSiteUrl && params.scannedApiKey && params.scannedApiSecret) {
      setEditSiteUrl(params.scannedSiteUrl);
      setEditApiKey(params.scannedApiKey);
      setEditApiSecret(params.scannedApiSecret);
      setConfigExpanded(true);
      setSaveMessage({ type: "success", text: "QR config loaded. Tap Save to apply." });
    }
  }, [params.scannedSiteUrl, params.scannedApiKey, params.scannedApiSecret]);

  useEffect(() => {
    (async () => {
      const bio = await checkBiometricAvailability();
      setBioAvailable(bio.available);
      setBioType(bio.type);
    })();
  }, []);

  const checkNotifPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    const { status } = await Notifications.getPermissionsAsync();
    setNotifEnabled(status === "granted");
  }, []);

  useEffect(() => { checkNotifPermission(); }, [checkNotifPermission]);

  const handleToggleNotifications = async () => {
    if (notifEnabled) {
      stopAssignmentPolling();
      Alert.alert("Notifications Paused", "Assignment polling has been stopped.");
    } else {
      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotifEnabled(true);
        startAssignmentPolling();
        Alert.alert("Notifications Enabled", "You will be notified when new run sheets are assigned.");
      } else {
        Alert.alert("Permission Required", "Please enable notifications in your device settings.");
      }
    }
  };

  const handleSaveConfig = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();
    if (!url) { setSaveMessage({ type: "error", text: "Server URL is required." }); return; }
    if (!key) { setSaveMessage({ type: "error", text: "API Key is required." }); return; }
    if (!secret) { setSaveMessage({ type: "error", text: "API Secret is required." }); return; }
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) normalizedUrl = "https://" + normalizedUrl;
    normalizedUrl = normalizedUrl.replace(/\/+$/, "");
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateCredentials(normalizedUrl, key, secret);
      setSaveMessage({ type: "success", text: "Configuration saved and verified successfully." });
    } catch (error: any) {
      setSaveMessage({ type: "error", text: error?.message || "Could not connect. Please check your settings." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetConfig = () => {
    if (auth) { setEditSiteUrl(auth.siteUrl); setEditApiKey(auth.apiKey); setEditApiSecret(auth.apiSecret); setSaveMessage(null); }
  };

  const handleTestConnection = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();
    if (!url || !key || !secret) { setSaveMessage({ type: "error", text: "Fill in all fields before testing." }); return; }
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) normalizedUrl = "https://" + normalizedUrl;
    normalizedUrl = normalizedUrl.replace(/\/+$/, "");
    setIsTesting(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`${normalizedUrl}/api/method/frappe.auth.get_logged_user`, {
        method: "GET",
        headers: { Authorization: `token ${key}:${secret}`, "Content-Type": "application/json", Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setSaveMessage({ type: "success", text: `Connected as: ${data.message || "Unknown"}` });
      } else {
        setSaveMessage({ type: "error", text: `Server returned ${res.status}. Check credentials.` });
      }
    } catch (error: any) {
      setSaveMessage({ type: "error", text: error?.message || "Could not reach the server." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleScanQR = () => { router.push({ pathname: "/config-scanner", params: { source: "settings" } }); };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Sign out of this profile? You can switch back from the profile picker.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await signOut(); router.replace("/profile-picker"); } },
    ]);
  };

  const handleDeleteProfile = () => {
    if (!activeProfile) return;
    Alert.alert(
      "Delete Profile",
      "This will permanently remove this profile and all its saved data from this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => { await removeProfile(activeProfile.id); } },
      ]
    );
  };

  const handleSetPin = async () => {
    if (!activeProfile) return;
    if (newPin.length < 4) { setPinError("PIN must be at least 4 digits."); return; }
    if (newPin !== confirmPin) { setPinError("PINs do not match."); return; }
    await updateProfilePin(activeProfile.id, newPin);
    setPinSetup(false);
    setNewPin("");
    setConfirmPin("");
    setPinError("");
    Alert.alert("PIN Set", "Your profile is now protected with a PIN.");
  };

  const handleRemovePin = () => {
    if (!activeProfile) return;
    Alert.alert("Remove PIN", "Remove PIN protection from this profile?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await updateProfilePin(activeProfile.id, null);
          Alert.alert("PIN Removed", "Profile PIN protection has been removed.");
        },
      },
    ]);
  };

  const handleToggleBiometric = async () => {
    if (!activeProfile) return;
    const newValue = !activeProfile.useBiometric;
    await updateProfileBiometric(activeProfile.id, newValue);
    Alert.alert(
      newValue ? "Biometric Enabled" : "Biometric Disabled",
      newValue
        ? `${bioType || "Biometric"} authentication is now required to unlock this profile.`
        : "Biometric authentication has been disabled for this profile."
    );
  };

  const handleSyncNow = async () => {
    if (!isOnline) { Alert.alert("Offline", "Cannot sync while offline."); return; }
    if (pendingCount === 0) { Alert.alert("All Synced", "No pending changes to sync."); return; }
    await syncNow();
  };

  const formatLastSync = () => {
    if (!lastSync) return "Never";
    try {
      return new Date(lastSync).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return lastSync; }
  };

  const hasPin = !!activeProfile?.pin;
  const hasBio = !!activeProfile?.useBiometric;

  return (
    <ScreenContainer edges={["bottom", "left", "right"]} containerClassName="bg-white">
      {/* Blue gradient header */}
      <LinearGradient
        colors={[BLUE, BLUE_LIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[st.gradientHeader, { paddingTop: insets.top + 8 }]}
      >
        <Text style={st.headerTitle}>Settings</Text>
        {auth?.driverName ? (
          <Text style={st.headerSubtitle}>{auth.driverName}</Text>
        ) : auth?.fullName ? (
          <Text style={st.headerSubtitle}>{auth.fullName}</Text>
        ) : null}
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 50, paddingHorizontal: 16, paddingTop: 16 }}
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        {/* Profile Card */}
        <View style={st.card}>
          <View style={st.userRow}>
            <View style={[st.avatar, { backgroundColor: activeProfile?.avatarColor || BLUE }]}>
              <Text style={st.avatarText}>
                {(auth?.fullName || auth?.userName || "?").split(" ").map(w => w[0]).join("").toUpperCase().substring(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.userName}>{auth?.fullName || "Unknown User"}</Text>
              <Text style={st.userEmail}>{auth?.userName}</Text>
              {profiles.length > 1 ? (
                <Text style={[st.profileCount, { color: BLUE }]}>
                  {profiles.length} profiles on this device
                </Text>
              ) : null}
            </View>
          </View>

          <View style={st.divider} />

          <View style={st.infoRow}>
            <MaterialIcons name="language" size={18} color={GRAY} />
            <Text style={st.infoText} numberOfLines={1}>{auth?.siteUrl || "Not connected"}</Text>
          </View>

          {auth?.driverId ? (
            <View style={st.infoRow}>
              <MaterialIcons name="badge" size={18} color={BLUE} />
              <Text style={[st.infoText, { color: BLUE }]} numberOfLines={1}>Driver: {auth.driverName || auth.driverId}</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={st.infoRow}>
                <MaterialIcons name="warning" size={18} color={WARN} />
                <Text style={[st.infoText, { color: WARN }]} numberOfLines={3}>
                  No Driver record linked. Set the "User" field on your Driver record to: {auth?.userName}
                </Text>
              </View>
              {auth?.driverLinkError ? (
                <TouchableOpacity
                  onPress={() => Alert.alert("Driver Lookup Details", auth.driverLinkError || "No details", [{ text: "OK" }])}
                  style={st.diagLink}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="info-outline" size={14} color={GRAY} />
                  <Text style={st.diagText}>View diagnostic details</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={st.retryBtn}
                onPress={async () => {
                  if (!auth) return;
                  try {
                    await updateCredentials(auth.siteUrl, auth.apiKey, auth.apiSecret);
                    Alert.alert("Retry Complete", auth?.driverId ? "Driver linked!" : "Still no Driver found. Check diagnostics.");
                  } catch (e: any) {
                    Alert.alert("Error", e?.message || "Failed to retry.");
                  }
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="refresh" size={16} color={BLUE} />
                <Text style={[st.retryText, { color: BLUE }]}>Retry Driver Lookup</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Profile Security */}
        <Text style={st.sectionLabel}>PROFILE SECURITY</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <TouchableOpacity
            style={st.securityRow}
            onPress={() => {
              if (hasPin) {
                Alert.alert("PIN Protection", "Your profile is protected with a PIN.", [
                  { text: "Change PIN", onPress: () => { setPinSetup(true); setSecurityExpanded(true); } },
                  { text: "Remove PIN", style: "destructive", onPress: handleRemovePin },
                  { text: "Cancel", style: "cancel" },
                ]);
              } else {
                setPinSetup(true);
                setSecurityExpanded(true);
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="pin" size={22} color={hasPin ? GREEN : GRAY} />
            <View style={{ flex: 1 }}>
              <Text style={st.securityLabel}>PIN Lock</Text>
              <Text style={st.securityDesc}>
                {hasPin ? "Enabled — tap to change or remove" : "Tap to set a PIN"}
              </Text>
            </View>
            <View style={[st.statusDot, { backgroundColor: hasPin ? GREEN : BORDER }]} />
          </TouchableOpacity>

          {pinSetup && securityExpanded && (
            <View style={st.pinSetupArea}>
              <Text style={st.pinSetupTitle}>{hasPin ? "Change PIN" : "Set PIN"}</Text>
              <TextInput
                style={[st.pinInput, { borderColor: pinError ? RED : BORDER }]}
                value={newPin}
                onChangeText={(t) => { setNewPin(t.replace(/[^0-9]/g, "")); setPinError(""); }}
                placeholder="Enter new PIN (4-6 digits)"
                placeholderTextColor="#C7C7CC"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                returnKeyType="next"
              />
              <TextInput
                style={[st.pinInput, { borderColor: pinError ? RED : BORDER }]}
                value={confirmPin}
                onChangeText={(t) => { setConfirmPin(t.replace(/[^0-9]/g, "")); setPinError(""); }}
                placeholder="Confirm PIN"
                placeholderTextColor="#C7C7CC"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleSetPin}
              />
              {pinError ? <Text style={st.pinErrorText}>{pinError}</Text> : null}
              <View style={st.pinActions}>
                <TouchableOpacity
                  style={st.pinCancelBtn}
                  onPress={() => { setPinSetup(false); setNewPin(""); setConfirmPin(""); setPinError(""); setSecurityExpanded(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={st.pinCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.pinSaveBtn, { backgroundColor: BLUE }]}
                  onPress={handleSetPin}
                  activeOpacity={0.7}
                >
                  <Text style={st.pinSaveText}>Save PIN</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={st.rowDivider} />

          <TouchableOpacity
            style={st.securityRow}
            onPress={() => {
              if (!bioAvailable) {
                Alert.alert("Not Available", "Biometric authentication is not available on this device.");
                return;
              }
              handleToggleBiometric();
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="fingerprint"
              size={22}
              color={hasBio ? GREEN : (bioAvailable ? GRAY : BORDER)}
            />
            <View style={{ flex: 1 }}>
              <Text style={[st.securityLabel, { color: bioAvailable ? FG : GRAY }]}>
                {bioType || "Biometric"} Lock
              </Text>
              <Text style={st.securityDesc}>
                {!bioAvailable ? "Not available on this device" : hasBio ? "Enabled — tap to disable" : "Tap to enable"}
              </Text>
            </View>
            <View style={[st.statusDot, { backgroundColor: hasBio ? GREEN : BORDER }]} />
          </TouchableOpacity>
        </View>

        {/* Configuration */}
        <Text style={st.sectionLabel}>CONFIGURATION</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <TouchableOpacity
            style={st.configHeader}
            onPress={() => { setConfigExpanded(!configExpanded); setSaveMessage(null); }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="settings-ethernet" size={22} color={BLUE} />
            <View style={{ flex: 1 }}>
              <Text style={st.configTitle}>Server Connection</Text>
              <Text style={st.configSubtitle} numberOfLines={1}>{auth?.siteUrl || "Not configured"}</Text>
            </View>
            <MaterialIcons name={configExpanded ? "expand-less" : "expand-more"} size={26} color={GRAY} />
          </TouchableOpacity>

          {configExpanded && (
            <View style={st.configBody}>
              <TouchableOpacity
                style={st.scanQrBtn}
                onPress={handleScanQR}
                activeOpacity={0.7}
              >
                <MaterialIcons name="qr-code-scanner" size={22} color={BLUE} />
                <Text style={[st.scanQrText, { color: BLUE }]}>Scan QR Code to Configure</Text>
              </TouchableOpacity>

              <View style={st.orDivider}>
                <View style={st.orLine} />
                <Text style={st.orText}>or enter manually</Text>
                <View style={st.orLine} />
              </View>

              <View style={st.fieldGroup}>
                <Text style={st.fieldLabel}>Server URL</Text>
                <View style={st.inputRow}>
                  <MaterialIcons name="language" size={20} color={GRAY} />
                  <TextInput
                    style={st.input}
                    value={editSiteUrl}
                    onChangeText={(t) => { setEditSiteUrl(t); setSaveMessage(null); }}
                    placeholder="https://your-site.frappe.cloud"
                    placeholderTextColor="#C7C7CC"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={st.fieldGroup}>
                <Text style={st.fieldLabel}>API Key</Text>
                <View style={st.inputRow}>
                  <MaterialIcons name="vpn-key" size={20} color={GRAY} />
                  <TextInput
                    style={st.input}
                    value={editApiKey}
                    onChangeText={(t) => { setEditApiKey(t); setSaveMessage(null); }}
                    placeholder="Your API Key"
                    placeholderTextColor="#C7C7CC"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={st.fieldGroup}>
                <Text style={st.fieldLabel}>API Secret</Text>
                <View style={st.inputRow}>
                  <MaterialIcons name="lock" size={20} color={GRAY} />
                  <TextInput
                    style={st.input}
                    value={editApiSecret}
                    onChangeText={(t) => { setEditApiSecret(t); setSaveMessage(null); }}
                    placeholder="Your API Secret"
                    placeholderTextColor="#C7C7CC"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showApiSecret}
                    returnKeyType="done"
                  />
                  <TouchableOpacity onPress={() => setShowApiSecret(!showApiSecret)} style={st.eyeBtn} activeOpacity={0.6}>
                    <MaterialIcons name={showApiSecret ? "visibility-off" : "visibility"} size={20} color={GRAY} />
                  </TouchableOpacity>
                </View>
              </View>

              {saveMessage && (
                <View style={[st.messageBox, {
                  backgroundColor: saveMessage.type === "success" ? GREEN + "15" : RED + "15",
                  borderColor: saveMessage.type === "success" ? GREEN : RED,
                }]}>
                  <MaterialIcons
                    name={saveMessage.type === "success" ? "check-circle" : "error-outline"}
                    size={18}
                    color={saveMessage.type === "success" ? GREEN : RED}
                  />
                  <Text style={[st.messageText, { color: saveMessage.type === "success" ? GREEN : RED }]}>
                    {saveMessage.text}
                  </Text>
                </View>
              )}

              <View style={st.configActions}>
                <TouchableOpacity
                  style={st.configBtn}
                  onPress={handleTestConnection}
                  disabled={isTesting}
                  activeOpacity={0.7}
                >
                  {isTesting ? <ActivityIndicator size="small" color={BLUE} /> : <MaterialIcons name="wifi-tethering" size={18} color={BLUE} />}
                  <Text style={[st.configBtnText, { color: BLUE }]}>Test</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.configBtn}
                  onPress={handleResetConfig}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="undo" size={18} color={GRAY} />
                  <Text style={[st.configBtnText, { color: GRAY }]}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[st.configBtn, st.configBtnPrimary, { backgroundColor: BLUE, opacity: isSaving ? 0.6 : 1 }]}
                  onPress={handleSaveConfig}
                  disabled={isSaving}
                  activeOpacity={0.7}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="save" size={18} color="#fff" />}
                  <Text style={[st.configBtnText, { color: "#fff" }]}>Save</Text>
                </TouchableOpacity>
              </View>

              <View style={st.hintBox}>
                <MaterialIcons name="info-outline" size={16} color={GRAY} />
                <Text style={st.hintText}>
                  Generate API keys in your Frappe site under Settings {">"} API Access. Or scan a QR code from your administrator.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Sync Status */}
        <Text style={st.sectionLabel}>SYNC</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <SettingRow icon="cloud" iconColor={isOnline ? GREEN : RED} label="Status" value={isOnline ? "Online" : "Offline"} valueColor={isOnline ? GREEN : RED} />
          <View style={st.rowDivider} />
          <SettingRow icon="cloud-upload" iconColor={WARN} label="Pending Changes" value={String(pendingCount)} valueColor={pendingCount > 0 ? WARN : GRAY} />
          <View style={st.rowDivider} />
          <SettingRow icon="schedule" iconColor={GRAY} label="Last Sync" value={formatLastSync()} />
          <View style={st.rowDivider} />
          <TouchableOpacity style={st.actionRow} onPress={handleSyncNow} disabled={isSyncing} activeOpacity={0.7}>
            {isSyncing ? <ActivityIndicator size="small" color={BLUE} /> : <MaterialIcons name="sync" size={22} color={BLUE} />}
            <Text style={[st.actionText, { color: BLUE }]}>{isSyncing ? "Syncing..." : "Sync Now"}</Text>
          </TouchableOpacity>
        </View>

        {/* Appearance */}
        <Text style={st.sectionLabel}>APPEARANCE</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <ThemeOption label="System Default" icon="settings-brightness" selected={themePreference === "system"} onPress={() => setThemePreference("system")} />
          <View style={st.rowDivider} />
          <ThemeOption label="Light Mode" icon="light-mode" selected={themePreference === "light"} onPress={() => setThemePreference("light")} />
          <View style={st.rowDivider} />
          <ThemeOption label="Dark Mode" icon="dark-mode" selected={themePreference === "dark"} onPress={() => setThemePreference("dark")} />
        </View>

        {/* Session Timeout */}
        <Text style={st.sectionLabel}>SESSION TIMEOUT</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <View style={st.timeoutHeader}>
            <MaterialIcons name="timer" size={22} color={BLUE} />
            <View style={{ flex: 1 }}>
              <Text style={st.timeoutTitle}>Auto-Lock</Text>
              <Text style={st.timeoutDesc}>
                {timeoutMinutes === 0
                  ? "Disabled — profile stays unlocked"
                  : `Lock after ${timeoutMinutes} min of inactivity`}
              </Text>
            </View>
          </View>
          <View style={st.rowDivider} />
          {TIMEOUT_OPTIONS.map((opt, idx) => (
            <React.Fragment key={opt.value}>
              {idx > 0 && <View style={st.rowDivider} />}
              <TouchableOpacity
                style={st.timeoutRow}
                onPress={() => setTimeoutMinutes(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  st.timeoutLabel,
                  { color: timeoutMinutes === opt.value ? BLUE : FG },
                ]}>
                  {opt.label}
                </Text>
                {timeoutMinutes === opt.value ? (
                  <MaterialIcons name="check-circle" size={22} color={BLUE} />
                ) : (
                  <MaterialIcons name="radio-button-unchecked" size={22} color={BORDER} />
                )}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Live Location */}
        <Text style={st.sectionLabel}>LIVE LOCATION</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <TouchableOpacity
            style={st.securityRow}
            onPress={() => setLiveLocEnabled(!liveLocEnabled)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="my-location" size={22} color={liveLocEnabled ? GREEN : GRAY} />
            <View style={{ flex: 1 }}>
              <Text style={st.securityLabel}>Share Location</Text>
              <Text style={st.securityDesc}>
                {liveLocEnabled
                  ? isTracking
                    ? "Actively sharing your location with the server"
                    : "Enabled — waiting for GPS signal"
                  : "Disabled — location is not shared"}
              </Text>
            </View>
            <View style={[st.statusDot, { backgroundColor: isTracking ? GREEN : liveLocEnabled ? WARN : BORDER }]} />
          </TouchableOpacity>

          {liveLocEnabled && (
            <>
              <View style={st.rowDivider} />
              <View style={st.timeoutHeader}>
                <MaterialIcons name="update" size={22} color={BLUE} />
                <View style={{ flex: 1 }}>
                  <Text style={st.timeoutTitle}>Update Interval</Text>
                  <Text style={st.timeoutDesc}>
                    How often to send location to the server
                  </Text>
                </View>
              </View>
              {INTERVAL_OPTIONS.map((opt, idx) => (
                <React.Fragment key={opt.value}>
                  <View style={st.rowDivider} />
                  <TouchableOpacity
                    style={st.timeoutRow}
                    onPress={() => setIntervalMs(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      st.timeoutLabel,
                      { color: intervalMs === opt.value ? BLUE : FG },
                    ]}>
                      {opt.label}
                    </Text>
                    {intervalMs === opt.value ? (
                      <MaterialIcons name="check-circle" size={22} color={BLUE} />
                    ) : (
                      <MaterialIcons name="radio-button-unchecked" size={22} color={BORDER} />
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              ))}

              {lastUpdate && (
                <>
                  <View style={st.rowDivider} />
                  <View style={[st.settingRow, { paddingVertical: 12 }]}>
                    <MaterialIcons name="gps-fixed" size={18} color={GREEN} />
                    <Text style={[st.settingLabel, { fontSize: 13 }]}>Last Update</Text>
                    <Text style={[st.settingValue, { fontSize: 12, color: GRAY }]}>
                      {new Date(lastUpdate.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Shift Log */}
        <Text style={st.sectionLabel}>SHIFT LOG</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <View style={st.securityRow}>
            <MaterialIcons name="timer" size={22} color={isClocked ? GREEN : GRAY} />
            <View style={{ flex: 1 }}>
              <Text style={st.securityLabel}>Current Shift</Text>
              <Text style={st.securityDesc}>
                {isClocked
                  ? `Clocked in \u2014 ${formatDuration(elapsedMs)}`
                  : "Not clocked in"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={async () => {
                if (isClocked) {
                  await clockOut();
                } else if (activeProfile) {
                  await clockIn(activeProfile.id);
                }
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 16,
                backgroundColor: isClocked ? RED : GREEN,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>
                {isClocked ? "Clock Out" : "Clock In"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={st.rowDivider} />
          <View style={[st.settingRow, { paddingVertical: 12 }]}>
            <MaterialIcons name="today" size={18} color={BLUE} />
            <Text style={[st.settingLabel, { fontSize: 13 }]}>Today's Total</Text>
            <Text style={[st.settingValue, { fontSize: 13, fontWeight: "700", color: BLUE }]}>
              {formatDurationShort(totalTodayMs)}
            </Text>
          </View>

          {todayShifts.length > 0 && (
            <>
              <View style={st.rowDivider} />
              <View style={[st.settingRow, { paddingVertical: 12 }]}>
                <MaterialIcons name="history" size={18} color={GRAY} />
                <Text style={[st.settingLabel, { fontSize: 13 }]}>Today's Shifts</Text>
                <Text style={[st.settingValue, { fontSize: 12, color: GRAY }]}>
                  {todayShifts.length} shift{todayShifts.length !== 1 ? "s" : ""}
                </Text>
              </View>
            </>
          )}

          {auth && todayShifts.some((s) => !s.synced) && (
            <>
              <View style={st.rowDivider} />
              <TouchableOpacity
                style={st.actionRow}
                onPress={async () => {
                  const result = await syncShifts(auth);
                  Alert.alert(
                    "Shift Sync",
                    `Synced ${result.synced} shift${result.synced !== 1 ? "s" : ""}${result.failed > 0 ? `, ${result.failed} failed` : ""}`
                  );
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="cloud-upload" size={22} color={BLUE} />
                <Text style={[st.actionText, { color: BLUE }]}>Sync Shift Records</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Geofence Alerts */}
        <Text style={st.sectionLabel}>GEOFENCE ALERTS</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <TouchableOpacity
            style={st.securityRow}
            onPress={() => setGeoEnabled(!geoEnabled)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="location-searching" size={22} color={geoEnabled ? GREEN : GRAY} />
            <View style={{ flex: 1 }}>
              <Text style={st.securityLabel}>Auto-Detect Arrival</Text>
              <Text style={st.securityDesc}>
                {geoEnabled
                  ? geoMonitoring
                    ? "Monitoring delivery locations"
                    : "Enabled \u2014 open a run sheet to start monitoring"
                  : "Disabled \u2014 no automatic arrival detection"}
              </Text>
            </View>
            <View style={[st.statusDot, { backgroundColor: geoMonitoring ? GREEN : geoEnabled ? WARN : BORDER }]} />
          </TouchableOpacity>

          {geoEnabled && (
            <>
              <View style={st.rowDivider} />
              <View style={st.timeoutHeader}>
                <MaterialIcons name="adjust" size={22} color={BLUE} />
                <View style={{ flex: 1 }}>
                  <Text style={st.timeoutTitle}>Detection Radius</Text>
                  <Text style={st.timeoutDesc}>
                    Alert when within this distance of a delivery location
                  </Text>
                </View>
              </View>
              {RADIUS_OPTIONS.map((opt) => (
                <React.Fragment key={opt.value}>
                  <View style={st.rowDivider} />
                  <TouchableOpacity
                    style={st.timeoutRow}
                    onPress={() => setRadiusM(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      st.timeoutLabel,
                      { color: radiusM === opt.value ? BLUE : FG },
                    ]}>
                      {opt.label}
                    </Text>
                    {radiusM === opt.value ? (
                      <MaterialIcons name="check-circle" size={22} color={BLUE} />
                    ) : (
                      <MaterialIcons name="radio-button-unchecked" size={22} color={BORDER} />
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              ))}

              {recentAlerts.length > 0 && (
                <>
                  <View style={st.rowDivider} />
                  <View style={[st.settingRow, { paddingVertical: 12 }]}>
                    <MaterialIcons name="history" size={18} color={ORANGE} />
                    <Text style={[st.settingLabel, { fontSize: 13 }]}>Recent Alerts</Text>
                    <Text style={[st.settingValue, { fontSize: 12, color: GRAY }]}>
                      {recentAlerts.length} alert{recentAlerts.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Notifications */}
        <Text style={st.sectionLabel}>NOTIFICATIONS</Text>
        <View style={[st.card, { padding: 0, overflow: "hidden" }]}>
          <SettingRow icon="notifications" iconColor={notifEnabled ? GREEN : GRAY} label="Assignment Alerts" value={notifEnabled ? "Enabled" : "Disabled"} valueColor={notifEnabled ? GREEN : GRAY} />
          <View style={st.rowDivider} />
          <TouchableOpacity style={st.actionRow} onPress={handleToggleNotifications} activeOpacity={0.7}>
            <MaterialIcons name={notifEnabled ? "notifications-off" : "notifications-active"} size={22} color={BLUE} />
            <Text style={[st.actionText, { color: BLUE }]}>{notifEnabled ? "Pause Notifications" : "Enable Notifications"}</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Actions */}
        <Text style={st.sectionLabel}>PROFILE</Text>

        {profiles.length > 1 ? (
          <TouchableOpacity
            style={st.profileActionBtn}
            onPress={() => {
              Alert.alert("Switch Profile", "Sign out and return to the profile picker?", [
                { text: "Cancel", style: "cancel" },
                { text: "Switch", onPress: async () => { await signOut(); router.replace("/profile-picker"); } },
              ]);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="swap-horiz" size={22} color={BLUE} />
            <Text style={[st.profileActionText, { color: BLUE }]}>Switch Profile</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={st.profileActionBtn}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={22} color={WARN} />
          <Text style={[st.profileActionText, { color: WARN }]}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.profileActionBtn, { borderColor: RED + "30" }]}
          onPress={handleDeleteProfile}
          activeOpacity={0.7}
        >
          <MaterialIcons name="delete-forever" size={22} color={RED} />
          <Text style={[st.profileActionText, { color: RED }]}>Delete This Profile</Text>
        </TouchableOpacity>

        <Text style={st.version}>Driver v2.0.0</Text>
        <Text style={st.brand}>Powered by Agilasoft Cloud Technologies Inc.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function ThemeOption({ label, icon, selected, onPress }: {
  label: string; icon: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={st.themeRow} onPress={onPress} activeOpacity={0.7}>
      <MaterialIcons name={icon as any} size={22} color={selected ? BLUE : GRAY} />
      <Text style={[st.themeLabel, { color: selected ? BLUE : FG }]}>{label}</Text>
      {selected ? (
        <MaterialIcons name="check-circle" size={22} color={BLUE} />
      ) : (
        <MaterialIcons name="radio-button-unchecked" size={22} color={BORDER} />
      )}
    </TouchableOpacity>
  );
}

function SettingRow({ icon, iconColor, label, value, valueColor }: {
  icon: string; iconColor: string; label: string; value: string; valueColor?: string;
}) {
  return (
    <View style={st.settingRow}>
      <MaterialIcons name={icon as any} size={22} color={iconColor} />
      <Text style={st.settingLabel}>{label}</Text>
      <Text style={[st.settingValue, { color: valueColor || GRAY }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  // Header
  gradientHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  // Cards
  card: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  userName: { fontSize: 17, fontWeight: "700", color: FG },
  userEmail: { fontSize: 14, color: GRAY, marginTop: 2 },
  profileCount: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  divider: { height: 0.5, marginVertical: 14, backgroundColor: BORDER },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  infoText: { fontSize: 14, flex: 1, color: GRAY },
  diagLink: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 28 },
  diagText: { fontSize: 13, textDecorationLine: "underline", color: GRAY },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 28, marginTop: 2 },
  retryText: { fontSize: 14, fontWeight: "600" },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginLeft: 4, letterSpacing: 0.5, color: GRAY },

  // Security
  securityRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  securityLabel: { fontSize: 15, fontWeight: "600", color: FG },
  securityDesc: { fontSize: 12, marginTop: 2, color: GRAY },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  pinSetupArea: { paddingHorizontal: 20, paddingBottom: 20, gap: 12, borderTopWidth: 0.5, borderTopColor: BORDER },
  pinSetupTitle: { fontSize: 15, fontWeight: "700", marginTop: 12, color: FG },
  pinInput: { height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 20, fontSize: 20, textAlign: "center", letterSpacing: 6, fontWeight: "600", backgroundColor: SURFACE, color: FG },
  pinErrorText: { fontSize: 13, textAlign: "center", color: RED },
  pinActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  pinCancelBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  pinCancelText: { fontSize: 15, fontWeight: "600", color: GRAY },
  pinSaveBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pinSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Configuration
  configHeader: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  configTitle: { fontSize: 15, fontWeight: "600", color: FG },
  configSubtitle: { fontSize: 13, marginTop: 2, color: GRAY },
  configBody: { paddingHorizontal: 20, paddingBottom: 20, gap: 16, borderTopWidth: 0.5, borderTopColor: BORDER },
  scanQrBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    paddingVertical: 18, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: BLUE, backgroundColor: SURFACE, marginTop: 14,
  },
  scanQrText: { fontSize: 15, fontWeight: "700" },
  orDivider: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, height: 0.5, backgroundColor: BORDER },
  orText: { fontSize: 12, fontWeight: "500", color: GRAY },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginLeft: 2, color: GRAY },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50, gap: 10, borderColor: BORDER, backgroundColor: SURFACE },
  input: { flex: 1, fontSize: 15, height: 50, color: FG },
  eyeBtn: { padding: 6 },
  messageBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  messageText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  configActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  configBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  configBtnPrimary: { flex: 1, justifyContent: "center", borderWidth: 0 },
  configBtnText: { fontSize: 14, fontWeight: "700" },
  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, backgroundColor: SURFACE, borderWidth: 0.5, borderColor: BORDER },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18, color: GRAY },

  // Settings rows
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  settingLabel: { fontSize: 15, flex: 1, color: FG },
  settingValue: { fontSize: 15, fontWeight: "600" },
  rowDivider: { height: 0.5, marginHorizontal: 20, backgroundColor: BORDER },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  actionText: { fontSize: 15, fontWeight: "600", flex: 1 },

  // Profile actions
  profileActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingVertical: 18, marginBottom: 12,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
    }),
  },
  profileActionText: { fontSize: 16, fontWeight: "700" },

  // Theme rows
  themeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  themeLabel: { fontSize: 15, fontWeight: "600", flex: 1 },

  // Session timeout
  timeoutHeader: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  timeoutTitle: { fontSize: 15, fontWeight: "600", color: FG },
  timeoutDesc: { fontSize: 12, marginTop: 2, color: GRAY },
  timeoutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  timeoutLabel: { fontSize: 15, fontWeight: "600" },
  version: { fontSize: 13, textAlign: "center", marginTop: 12, color: GRAY },
  brand: { fontSize: 12, textAlign: "center", marginTop: 4, color: GRAY },
});
