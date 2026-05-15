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
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSync } from "@/lib/sync-context";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  requestNotificationPermissions,
  startAssignmentPolling,
  stopAssignmentPolling,
} from "@/lib/notifications";
import { checkBiometricAvailability } from "@/lib/profile-manager";

export default function SettingsScreen() {
  const {
    auth, logout, updateCredentials, signOut,
    activeProfile, profiles,
    updateProfilePin, updateProfileBiometric, removeProfile,
  } = useAuth();
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    scannedSiteUrl?: string;
    scannedApiKey?: string;
    scannedApiSecret?: string;
  }>();
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Configuration editing state
  const [configExpanded, setConfigExpanded] = useState(false);
  const [editSiteUrl, setEditSiteUrl] = useState(auth?.siteUrl || "");
  const [editApiKey, setEditApiKey] = useState(auth?.apiKey || "");
  const [editApiSecret, setEditApiSecret] = useState(auth?.apiSecret || "");
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Security state
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

  // Check biometric availability
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
      { text: "Sign Out", style: "destructive", onPress: async () => { await signOut(); } },
    ]);
  };

  const handleDeleteProfile = () => {
    if (!activeProfile) return;
    Alert.alert(
      "Delete Profile",
      "This will permanently remove this profile and all its saved data from this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeProfile(activeProfile.id);
          },
        },
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
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 50, paddingHorizontal: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
        <Text style={[s.pageTitle, { color: colors.foreground }]}>Settings</Text>

        {/* Profile Card */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.userRow}>
            <View style={[s.avatar, { backgroundColor: activeProfile?.avatarColor || colors.primary }]}>
              <Text style={s.avatarText}>
                {(auth?.fullName || auth?.userName || "?").split(" ").map(w => w[0]).join("").toUpperCase().substring(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.userName, { color: colors.foreground }]}>{auth?.fullName || "Unknown User"}</Text>
              <Text style={[s.userEmail, { color: colors.muted }]}>{auth?.userName}</Text>
              {profiles.length > 1 ? (
                <Text style={[s.profileCount, { color: colors.primary }]}>
                  {profiles.length} profiles on this device
                </Text>
              ) : null}
            </View>
          </View>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          <View style={s.infoRow}>
            <MaterialIcons name="language" size={18} color={colors.muted} />
            <Text style={[s.infoText, { color: colors.muted }]} numberOfLines={1}>{auth?.siteUrl || "Not connected"}</Text>
          </View>

          {auth?.driverId ? (
            <View style={s.infoRow}>
              <MaterialIcons name="badge" size={18} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.primary }]} numberOfLines={1}>Driver: {auth.driverName || auth.driverId}</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={s.infoRow}>
                <MaterialIcons name="warning" size={18} color={colors.warning} />
                <Text style={[s.infoTextWarn, { color: colors.warning }]} numberOfLines={3}>
                  No Driver record linked. Set the "User" field on your Driver record to: {auth?.userName}
                </Text>
              </View>
              {auth?.driverLinkError ? (
                <TouchableOpacity
                  onPress={() => Alert.alert("Driver Lookup Details", auth.driverLinkError || "No details", [{ text: "OK" }])}
                  style={s.diagLink}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="info-outline" size={14} color={colors.muted} />
                  <Text style={[s.diagText, { color: colors.muted }]}>View diagnostic details</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={s.retryBtn}
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
                <MaterialIcons name="refresh" size={16} color={colors.primary} />
                <Text style={[s.retryText, { color: colors.primary }]}>Retry Driver Lookup</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Profile Security */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>PROFILE SECURITY</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
          {/* PIN */}
          <TouchableOpacity
            style={s.securityRow}
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
            <MaterialIcons name="pin" size={22} color={hasPin ? colors.success : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={[s.securityLabel, { color: colors.foreground }]}>PIN Lock</Text>
              <Text style={[s.securityDesc, { color: colors.muted }]}>
                {hasPin ? "Enabled — tap to change or remove" : "Tap to set a PIN"}
              </Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: hasPin ? colors.success : colors.border }]} />
          </TouchableOpacity>

          {pinSetup && securityExpanded && (
            <View style={[s.pinSetupArea, { borderTopColor: colors.border }]}>
              <Text style={[s.pinSetupTitle, { color: colors.foreground }]}>
                {hasPin ? "Change PIN" : "Set PIN"}
              </Text>
              <TextInput
                style={[s.pinInput, { backgroundColor: colors.background, borderColor: pinError ? colors.error : colors.border, color: colors.foreground }]}
                value={newPin}
                onChangeText={(t) => { setNewPin(t.replace(/[^0-9]/g, "")); setPinError(""); }}
                placeholder="Enter new PIN (4-6 digits)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                returnKeyType="next"
              />
              <TextInput
                style={[s.pinInput, { backgroundColor: colors.background, borderColor: pinError ? colors.error : colors.border, color: colors.foreground }]}
                value={confirmPin}
                onChangeText={(t) => { setConfirmPin(t.replace(/[^0-9]/g, "")); setPinError(""); }}
                placeholder="Confirm PIN"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleSetPin}
              />
              {pinError ? <Text style={[s.pinErrorText, { color: colors.error }]}>{pinError}</Text> : null}
              <View style={s.pinActions}>
                <TouchableOpacity
                  style={[s.pinCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setPinSetup(false); setNewPin(""); setConfirmPin(""); setPinError(""); setSecurityExpanded(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pinCancelText, { color: colors.muted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.pinSaveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSetPin}
                  activeOpacity={0.7}
                >
                  <Text style={s.pinSaveText}>Save PIN</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[s.rowDivider, { backgroundColor: colors.border }]} />

          {/* Biometric */}
          <TouchableOpacity
            style={s.securityRow}
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
              color={hasBio ? colors.success : (bioAvailable ? colors.muted : colors.border)}
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.securityLabel, { color: bioAvailable ? colors.foreground : colors.muted }]}>
                {bioType || "Biometric"} Lock
              </Text>
              <Text style={[s.securityDesc, { color: colors.muted }]}>
                {!bioAvailable ? "Not available on this device" : hasBio ? "Enabled — tap to disable" : "Tap to enable"}
              </Text>
            </View>
            <View style={[s.statusDot, { backgroundColor: hasBio ? colors.success : colors.border }]} />
          </TouchableOpacity>
        </View>

        {/* Configuration */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>CONFIGURATION</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
          <TouchableOpacity
            style={s.configHeader}
            onPress={() => { setConfigExpanded(!configExpanded); setSaveMessage(null); }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="settings-ethernet" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.configTitle, { color: colors.foreground }]}>Server Connection</Text>
              <Text style={[s.configSubtitle, { color: colors.muted }]} numberOfLines={1}>{auth?.siteUrl || "Not configured"}</Text>
            </View>
            <MaterialIcons name={configExpanded ? "expand-less" : "expand-more"} size={26} color={colors.muted} />
          </TouchableOpacity>

          {configExpanded && (
            <View style={[s.configBody, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[s.scanQrBtn, { borderColor: colors.primary, backgroundColor: colors.background }]}
                onPress={handleScanQR}
                activeOpacity={0.7}
              >
                <MaterialIcons name="qr-code-scanner" size={22} color={colors.primary} />
                <Text style={[s.scanQrText, { color: colors.primary }]}>Scan QR Code to Configure</Text>
              </TouchableOpacity>

              <View style={s.orDivider}>
                <View style={[s.orLine, { backgroundColor: colors.border }]} />
                <Text style={[s.orText, { color: colors.muted }]}>or enter manually</Text>
                <View style={[s.orLine, { backgroundColor: colors.border }]} />
              </View>

              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.muted }]}>Server URL</Text>
                <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <MaterialIcons name="language" size={20} color={colors.muted} />
                  <TextInput
                    style={[s.input, { color: colors.foreground }]}
                    value={editSiteUrl}
                    onChangeText={(t) => { setEditSiteUrl(t); setSaveMessage(null); }}
                    placeholder="https://your-site.frappe.cloud"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.muted }]}>API Key</Text>
                <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <MaterialIcons name="vpn-key" size={20} color={colors.muted} />
                  <TextInput
                    style={[s.input, { color: colors.foreground }]}
                    value={editApiKey}
                    onChangeText={(t) => { setEditApiKey(t); setSaveMessage(null); }}
                    placeholder="Your API Key"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={[s.fieldLabel, { color: colors.muted }]}>API Secret</Text>
                <View style={[s.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <MaterialIcons name="lock" size={20} color={colors.muted} />
                  <TextInput
                    style={[s.input, { color: colors.foreground }]}
                    value={editApiSecret}
                    onChangeText={(t) => { setEditApiSecret(t); setSaveMessage(null); }}
                    placeholder="Your API Secret"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showApiSecret}
                    returnKeyType="done"
                  />
                  <TouchableOpacity onPress={() => setShowApiSecret(!showApiSecret)} style={s.eyeBtn} activeOpacity={0.6}>
                    <MaterialIcons name={showApiSecret ? "visibility-off" : "visibility"} size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              {saveMessage && (
                <View style={[s.messageBox, {
                  backgroundColor: saveMessage.type === "success" ? colors.success + "15" : colors.error + "15",
                  borderColor: saveMessage.type === "success" ? colors.success : colors.error,
                }]}>
                  <MaterialIcons
                    name={saveMessage.type === "success" ? "check-circle" : "error-outline"}
                    size={18}
                    color={saveMessage.type === "success" ? colors.success : colors.error}
                  />
                  <Text style={[s.messageText, { color: saveMessage.type === "success" ? colors.success : colors.error }]}>
                    {saveMessage.text}
                  </Text>
                </View>
              )}

              <View style={s.configActions}>
                <TouchableOpacity
                  style={[s.configBtn, { borderColor: colors.border }]}
                  onPress={handleTestConnection}
                  disabled={isTesting}
                  activeOpacity={0.7}
                >
                  {isTesting ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="wifi-tethering" size={18} color={colors.primary} />}
                  <Text style={[s.configBtnText, { color: colors.primary }]}>Test</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.configBtn, { borderColor: colors.border }]}
                  onPress={handleResetConfig}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="undo" size={18} color={colors.muted} />
                  <Text style={[s.configBtnText, { color: colors.muted }]}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.configBtn, s.configBtnPrimary, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                  onPress={handleSaveConfig}
                  disabled={isSaving}
                  activeOpacity={0.7}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="save" size={18} color="#fff" />}
                  <Text style={[s.configBtnText, { color: "#fff" }]}>Save</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.hintBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <MaterialIcons name="info-outline" size={16} color={colors.muted} />
                <Text style={[s.hintText, { color: colors.muted }]}>
                  Generate API keys in your Frappe site under Settings {">"} API Access. Or scan a QR code from your administrator.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Sync Status */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>SYNC</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
          <SettingRow icon="cloud" iconColor={isOnline ? colors.success : colors.error} label="Status" value={isOnline ? "Online" : "Offline"} valueColor={isOnline ? colors.success : colors.error} colors={colors} />
          <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
          <SettingRow icon="cloud-upload" iconColor={colors.warning} label="Pending Changes" value={String(pendingCount)} valueColor={pendingCount > 0 ? colors.warning : colors.muted} colors={colors} />
          <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
          <SettingRow icon="schedule" iconColor={colors.muted} label="Last Sync" value={formatLastSync()} colors={colors} />
          <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={s.actionRow} onPress={handleSyncNow} disabled={isSyncing} activeOpacity={0.7}>
            {isSyncing ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="sync" size={22} color={colors.primary} />}
            <Text style={[s.actionText, { color: colors.primary }]}>{isSyncing ? "Syncing..." : "Sync Now"}</Text>
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>NOTIFICATIONS</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
          <SettingRow icon="notifications" iconColor={notifEnabled ? colors.success : colors.muted} label="Assignment Alerts" value={notifEnabled ? "Enabled" : "Disabled"} valueColor={notifEnabled ? colors.success : colors.muted} colors={colors} />
          <View style={[s.rowDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={s.actionRow} onPress={handleToggleNotifications} activeOpacity={0.7}>
            <MaterialIcons name={notifEnabled ? "notifications-off" : "notifications-active"} size={22} color={colors.primary} />
            <Text style={[s.actionText, { color: colors.primary }]}>{notifEnabled ? "Pause Notifications" : "Enable Notifications"}</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Actions */}
        <Text style={[s.sectionLabel, { color: colors.muted }]}>PROFILE</Text>

        {/* Switch Profile */}
        {profiles.length > 1 ? (
          <TouchableOpacity
            style={[s.profileActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              Alert.alert("Switch Profile", "Sign out and return to the profile picker?", [
                { text: "Cancel", style: "cancel" },
                { text: "Switch", onPress: async () => { await signOut(); } },
              ]);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="swap-horiz" size={22} color={colors.primary} />
            <Text style={[s.profileActionText, { color: colors.primary }]}>Switch Profile</Text>
          </TouchableOpacity>
        ) : null}

        {/* Sign Out */}
        <TouchableOpacity
          style={[s.profileActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <MaterialIcons name="logout" size={22} color={colors.warning} />
          <Text style={[s.profileActionText, { color: colors.warning }]}>Sign Out</Text>
        </TouchableOpacity>

        {/* Delete Profile */}
        <TouchableOpacity
          style={[s.profileActionBtn, { backgroundColor: colors.surface, borderColor: colors.error + "20" }]}
          onPress={handleDeleteProfile}
          activeOpacity={0.7}
        >
          <MaterialIcons name="delete-forever" size={22} color={colors.error} />
          <Text style={[s.profileActionText, { color: colors.error }]}>Delete This Profile</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={[s.version, { color: colors.muted }]}>Driver v2.0.0</Text>
        <Text style={[s.brand, { color: colors.muted }]}>Powered by Agilasoft Cloud Technologies Inc.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function SettingRow({ icon, iconColor, label, value, valueColor, colors }: {
  icon: string; iconColor: string; label: string; value: string; valueColor?: string; colors: any;
}) {
  return (
    <View style={s.settingRow}>
      <MaterialIcons name={icon as any} size={22} color={iconColor} />
      <Text style={[s.settingLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[s.settingValue, { color: valueColor || colors.muted }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: "800", marginBottom: 20, marginTop: 8 },
  card: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 16 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  userName: { fontSize: 17, fontWeight: "700" },
  userEmail: { fontSize: 14, marginTop: 2 },
  profileCount: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  divider: { height: 0.5, marginVertical: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  infoText: { fontSize: 14, flex: 1 },
  infoTextWarn: { fontSize: 13, flex: 1, lineHeight: 19 },
  diagLink: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 28 },
  diagText: { fontSize: 13, textDecorationLine: "underline" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 28, marginTop: 2 },
  retryText: { fontSize: 14, fontWeight: "600" },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  // Security
  securityRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  securityLabel: { fontSize: 15, fontWeight: "600" },
  securityDesc: { fontSize: 12, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  pinSetupArea: { paddingHorizontal: 20, paddingBottom: 20, gap: 12, borderTopWidth: 0.5 },
  pinSetupTitle: { fontSize: 15, fontWeight: "700", marginTop: 12 },
  pinInput: { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 20, fontSize: 20, textAlign: "center", letterSpacing: 6, fontWeight: "600" },
  pinErrorText: { fontSize: 13, textAlign: "center" },
  pinActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  pinCancelBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pinCancelText: { fontSize: 15, fontWeight: "600" },
  pinSaveBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pinSaveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Configuration
  configHeader: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 18 },
  configTitle: { fontSize: 15, fontWeight: "600" },
  configSubtitle: { fontSize: 13, marginTop: 2 },
  configBody: { paddingHorizontal: 20, paddingBottom: 20, gap: 16, borderTopWidth: 0.5 },
  scanQrBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    paddingVertical: 18, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", marginTop: 14,
  },
  scanQrText: { fontSize: 15, fontWeight: "700" },
  orDivider: { flexDirection: "row", alignItems: "center", gap: 12 },
  orLine: { flex: 1, height: 0.5 },
  orText: { fontSize: 12, fontWeight: "500" },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginLeft: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 52, gap: 10 },
  input: { flex: 1, fontSize: 15, height: 52 },
  eyeBtn: { padding: 6 },
  messageBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  messageText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  configActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  configBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  configBtnPrimary: { flex: 1, justifyContent: "center", borderWidth: 0 },
  configBtnText: { fontSize: 14, fontWeight: "700" },
  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 0.5 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18 },
  // Settings rows
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  settingLabel: { fontSize: 15, flex: 1 },
  settingValue: { fontSize: 15, fontWeight: "600" },
  rowDivider: { height: 0.5, marginHorizontal: 20 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  actionText: { fontSize: 15, fontWeight: "600", flex: 1 },
  // Profile actions
  profileActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 20, borderWidth: 1, paddingVertical: 18, marginBottom: 12,
  },
  profileActionText: { fontSize: 16, fontWeight: "700" },
  version: { fontSize: 13, textAlign: "center", marginTop: 12 },
  brand: { fontSize: 12, textAlign: "center", marginTop: 4 },
});
