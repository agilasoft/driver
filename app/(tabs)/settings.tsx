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

export default function SettingsScreen() {
  const { auth, logout, updateCredentials } = useAuth();
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
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Sync form fields with auth state on first load
  useEffect(() => {
    if (auth) {
      setEditSiteUrl(auth.siteUrl);
      setEditApiKey(auth.apiKey);
      setEditApiSecret(auth.apiSecret);
    }
  }, [auth?.siteUrl, auth?.apiKey, auth?.apiSecret]);

  // Handle scanned QR config params
  useEffect(() => {
    if (params.scannedSiteUrl && params.scannedApiKey && params.scannedApiSecret) {
      setEditSiteUrl(params.scannedSiteUrl);
      setEditApiKey(params.scannedApiKey);
      setEditApiSecret(params.scannedApiSecret);
      setConfigExpanded(true);
      setSaveMessage({
        type: "success",
        text: "QR config loaded. Tap Save to apply.",
      });
    }
  }, [params.scannedSiteUrl, params.scannedApiKey, params.scannedApiSecret]);

  // Check if fields have changed from stored auth
  const hasChanges = useCallback(() => {
    if (!auth) return false;
    const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "");
    return (
      normalizeUrl(editSiteUrl) !== normalizeUrl(auth.siteUrl) ||
      editApiKey.trim() !== auth.apiKey ||
      editApiSecret.trim() !== auth.apiSecret
    );
  }, [auth, editSiteUrl, editApiKey, editApiSecret]);

  // Check notification permission status
  const checkNotifPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    const { status } = await Notifications.getPermissionsAsync();
    setNotifEnabled(status === "granted");
  }, []);

  useEffect(() => {
    checkNotifPermission();
  }, [checkNotifPermission]);

  const handleToggleNotifications = async () => {
    if (notifEnabled) {
      stopAssignmentPolling();
      Alert.alert(
        "Notifications Paused",
        "Assignment polling has been stopped. To fully disable notifications, go to your device Settings."
      );
    } else {
      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotifEnabled(true);
        startAssignmentPolling();
        Alert.alert(
          "Notifications Enabled",
          "You will be notified when new run sheets are assigned to you."
        );
      } else {
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings."
        );
      }
    }
  };

  const handleSaveConfig = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();

    if (!url) {
      setSaveMessage({ type: "error", text: "Server URL is required." });
      return;
    }
    if (!key) {
      setSaveMessage({ type: "error", text: "API Key is required." });
      return;
    }
    if (!secret) {
      setSaveMessage({ type: "error", text: "API Secret is required." });
      return;
    }

    // Normalize URL
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, "");

    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateCredentials(normalizedUrl, key, secret);
      setSaveMessage({
        type: "success",
        text: "Configuration saved and verified successfully.",
      });
    } catch (error: any) {
      setSaveMessage({
        type: "error",
        text:
          error?.message ||
          "Could not connect with the provided credentials. Please check your settings.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetConfig = () => {
    if (auth) {
      setEditSiteUrl(auth.siteUrl);
      setEditApiKey(auth.apiKey);
      setEditApiSecret(auth.apiSecret);
      setSaveMessage(null);
    }
  };

  const handleTestConnection = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();

    if (!url || !key || !secret) {
      setSaveMessage({
        type: "error",
        text: "Please fill in all connection fields before testing.",
      });
      return;
    }

    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, "");

    setIsTesting(true);
    setSaveMessage(null);
    try {
      const res = await fetch(
        `${normalizedUrl}/api/method/frappe.auth.get_logged_user`,
        {
          method: "GET",
          headers: {
            Authorization: `token ${key}:${secret}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setSaveMessage({
          type: "success",
          text: `Connection successful! Logged in as: ${data.message || "Unknown"}`,
        });
      } else {
        setSaveMessage({
          type: "error",
          text: `Server returned status ${res.status}. Check your credentials.`,
        });
      }
    } catch (error: any) {
      setSaveMessage({
        type: "error",
        text:
          error?.message ||
          "Could not reach the server. Check the URL and your network.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleScanQR = () => {
    router.push({
      pathname: "/config-scanner",
      params: { source: "settings" },
    });
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleSyncNow = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "Cannot sync while offline.");
      return;
    }
    if (pendingCount === 0) {
      Alert.alert("All Synced", "No pending changes to sync.");
      return;
    }
    await syncNow();
  };

  const formatLastSync = () => {
    if (!lastSync) return "Never";
    try {
      const d = new Date(lastSync);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return lastSync;
    }
  };

  const configDirty = hasChanges();

  return (
    <ScreenContainer className="px-4 pt-2">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-2xl font-bold text-foreground mb-6">
          Settings
        </Text>

        {/* User Info */}
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-lg font-bold">
                {(auth?.fullName || auth?.userName || "?")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                {auth?.fullName || "Unknown User"}
              </Text>
              <Text className="text-xs text-muted">{auth?.userName}</Text>
            </View>
          </View>

          <View className="border-t border-border pt-3 mt-1 gap-2">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="language" size={16} color={colors.muted} />
              <Text
                className="text-xs text-muted flex-1"
                numberOfLines={1}
              >
                {auth?.siteUrl || "Not connected"}
              </Text>
            </View>
            {auth?.driverId ? (
              <View className="flex-row items-center gap-2">
                <MaterialIcons
                  name="badge"
                  size={16}
                  color={colors.primary}
                />
                <Text
                  className="text-xs text-primary flex-1"
                  numberOfLines={1}
                >
                  Driver: {auth.driverName || auth.driverId}
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <MaterialIcons
                    name="warning"
                    size={16}
                    color={colors.warning}
                  />
                  <Text
                    className="text-xs text-warning flex-1"
                    numberOfLines={2}
                  >
                    No Driver record linked. Ensure the "User" field on your
                    Driver record in Frappe is set to: {auth?.userName}
                  </Text>
                </View>
                {auth?.driverLinkError ? (
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        "Driver Lookup Details",
                        auth.driverLinkError || "No details available",
                        [{ text: "OK" }]
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <Text
                      className="text-xs ml-6"
                      style={{ color: colors.muted, textDecorationLine: "underline" }}
                    >
                      Tap to view diagnostic details
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  className="flex-row items-center gap-1 ml-6 mt-1"
                  onPress={async () => {
                    if (!auth) return;
                    try {
                      await updateCredentials(auth.siteUrl, auth.apiKey, auth.apiSecret);
                      Alert.alert("Retry Complete", auth?.driverId ? "Driver linked successfully!" : "Still could not find a linked Driver record. Tap diagnostic details for more info.");
                    } catch (e: any) {
                      Alert.alert("Error", e?.message || "Failed to re-check driver link.");
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="refresh" size={14} color={colors.primary} />
                  <Text className="text-xs text-primary font-medium">
                    Retry Driver Lookup
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Configuration */}
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">
          CONFIGURATION
        </Text>
        <View className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
          {/* Collapsed summary */}
          <TouchableOpacity
            style={styles.configHeader}
            onPress={() => {
              setConfigExpanded(!configExpanded);
              setSaveMessage(null);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="settings-ethernet"
              size={20}
              color={colors.primary}
            />
            <View style={styles.configHeaderText}>
              <Text className="text-sm font-medium text-foreground">
                Server Connection
              </Text>
              <Text className="text-xs text-muted" numberOfLines={1}>
                {auth?.siteUrl || "Not configured"}
              </Text>
            </View>
            <MaterialIcons
              name={configExpanded ? "expand-less" : "expand-more"}
              size={24}
              color={colors.muted}
            />
          </TouchableOpacity>

          {configExpanded && (
            <View style={[styles.configBody, { borderTopColor: colors.border }]}>
              {/* Scan QR Button */}
              <TouchableOpacity
                style={[
                  styles.scanQrBtn,
                  { borderColor: colors.primary, backgroundColor: colors.background },
                ]}
                onPress={handleScanQR}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="qr-code-scanner"
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.scanQrText, { color: colors.primary }]}>
                  Scan QR Code to Configure
                </Text>
              </TouchableOpacity>

              {/* Divider with "or" */}
              <View style={styles.orDivider}>
                <View
                  style={[styles.orLine, { backgroundColor: colors.border }]}
                />
                <Text style={[styles.orText, { color: colors.muted }]}>
                  or enter manually
                </Text>
                <View
                  style={[styles.orLine, { backgroundColor: colors.border }]}
                />
              </View>

              {/* Server URL */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  Server URL
                </Text>
                <View
                  style={[styles.inputRow, { borderColor: colors.border }]}
                >
                  <MaterialIcons
                    name="language"
                    size={18}
                    color={colors.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editSiteUrl}
                    onChangeText={(text) => {
                      setEditSiteUrl(text);
                      setSaveMessage(null);
                    }}
                    placeholder="https://your-site.frappe.cloud"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* API Key */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  API Key
                </Text>
                <View
                  style={[styles.inputRow, { borderColor: colors.border }]}
                >
                  <MaterialIcons
                    name="vpn-key"
                    size={18}
                    color={colors.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editApiKey}
                    onChangeText={(text) => {
                      setEditApiKey(text);
                      setSaveMessage(null);
                    }}
                    placeholder="Your API Key"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* API Secret */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                  API Secret
                </Text>
                <View
                  style={[styles.inputRow, { borderColor: colors.border }]}
                >
                  <MaterialIcons
                    name="lock"
                    size={18}
                    color={colors.muted}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editApiSecret}
                    onChangeText={(text) => {
                      setEditApiSecret(text);
                      setSaveMessage(null);
                    }}
                    placeholder="Your API Secret"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showApiSecret}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    onPress={() => setShowApiSecret(!showApiSecret)}
                    style={styles.eyeBtn}
                    activeOpacity={0.6}
                  >
                    <MaterialIcons
                      name={showApiSecret ? "visibility-off" : "visibility"}
                      size={18}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Status message */}
              {saveMessage && (
                <View
                  style={[
                    styles.messageBox,
                    {
                      backgroundColor:
                        saveMessage.type === "success"
                          ? colors.success + "15"
                          : colors.error + "15",
                      borderColor:
                        saveMessage.type === "success"
                          ? colors.success
                          : colors.error,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={
                      saveMessage.type === "success"
                        ? "check-circle"
                        : "error-outline"
                    }
                    size={16}
                    color={
                      saveMessage.type === "success"
                        ? colors.success
                        : colors.error
                    }
                  />
                  <Text
                    style={[
                      styles.messageText,
                      {
                        color:
                          saveMessage.type === "success"
                            ? colors.success
                            : colors.error,
                      },
                    ]}
                  >
                    {saveMessage.text}
                  </Text>
                </View>
              )}

              {/* Action buttons */}
              <View style={styles.configActions}>
                <TouchableOpacity
                  style={[
                    styles.configBtn,
                    { borderColor: colors.border },
                  ]}
                  onPress={handleTestConnection}
                  disabled={isTesting}
                  activeOpacity={0.7}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons
                      name="wifi-tethering"
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  <Text style={[styles.configBtnText, { color: colors.primary }]}>
                    Test
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.configBtn,
                    { borderColor: colors.border },
                  ]}
                  onPress={handleResetConfig}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name="undo"
                    size={16}
                    color={colors.muted}
                  />
                  <Text style={[styles.configBtnText, { color: colors.muted }]}>
                    Reset
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.configBtn,
                    styles.configBtnPrimary,
                    {
                      backgroundColor: colors.primary,
                      opacity: isSaving ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSaveConfig}
                  disabled={isSaving}
                  activeOpacity={0.7}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="save" size={16} color="#fff" />
                  )}
                  <Text style={[styles.configBtnText, { color: "#fff" }]}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Connection info hint */}
              <View
                style={[
                  styles.hintBox,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name="info-outline"
                  size={14}
                  color={colors.muted}
                />
                <Text style={[styles.hintText, { color: colors.muted }]}>
                  Generate API keys in your Frappe site under Settings {">"} API
                  Access. Or scan a QR code provided by your administrator.
                  {"\n\n"}To link your Driver record, set the "User" field on
                  your Driver record in Frappe to your login email address.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Sync Status */}
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">
          SYNC
        </Text>
        <View className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
          <SettingRow
            icon="cloud"
            iconColor={isOnline ? colors.success : colors.error}
            label="Status"
            value={isOnline ? "Online" : "Offline"}
            valueColor={isOnline ? colors.success : colors.error}
          />
          <View className="border-t border-border" />
          <SettingRow
            icon="cloud-upload"
            iconColor={colors.warning}
            label="Pending Changes"
            value={String(pendingCount)}
            valueColor={pendingCount > 0 ? colors.warning : colors.muted}
          />
          <View className="border-t border-border" />
          <SettingRow
            icon="schedule"
            iconColor={colors.muted}
            label="Last Sync"
            value={formatLastSync()}
          />
          <View className="border-t border-border" />
          <TouchableOpacity
            className="flex-row items-center gap-3 px-4 py-3.5"
            onPress={handleSyncNow}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="sync" size={20} color={colors.primary} />
            )}
            <Text className="text-sm font-medium text-primary flex-1">
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">
          NOTIFICATIONS
        </Text>
        <View className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
          <SettingRow
            icon="notifications"
            iconColor={notifEnabled ? colors.success : colors.muted}
            label="Assignment Alerts"
            value={notifEnabled ? "Enabled" : "Disabled"}
            valueColor={notifEnabled ? colors.success : colors.muted}
          />
          <View className="border-t border-border" />
          <TouchableOpacity
            className="flex-row items-center gap-3 px-4 py-3.5"
            onPress={handleToggleNotifications}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={
                notifEnabled ? "notifications-off" : "notifications-active"
              }
              size={20}
              color={colors.primary}
            />
            <Text className="text-sm font-medium text-primary flex-1">
              {notifEnabled ? "Pause Notifications" : "Enable Notifications"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          className="bg-surface rounded-2xl border border-border py-3.5 items-center mt-4"
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text className="text-error text-base font-medium">Sign Out</Text>
        </TouchableOpacity>

        {/* Version & Branding */}
        <Text className="text-xs text-muted text-center mt-6">
          Driver v1.4.0
        </Text>
        <Text className="text-xs text-muted text-center mt-1">
          Powered by Agilasoft Cloud Technologies Inc.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function SettingRow({
  icon,
  iconColor,
  label,
  value,
  valueColor,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <MaterialIcons name={icon as any} size={20} color={iconColor} />
      <Text className="text-sm text-foreground flex-1">{label}</Text>
      <Text
        className="text-sm font-medium"
        style={{ color: valueColor || colors.muted }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  configHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  configHeaderText: {
    flex: 1,
    gap: 2,
  },
  configBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
    borderTopWidth: 0.5,
  },
  scanQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 12,
  },
  scanQrText: {
    fontSize: 14,
    fontWeight: "600",
  },
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orLine: {
    flex: 1,
    height: 0.5,
  },
  orText: {
    fontSize: 11,
    fontWeight: "500",
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: 44,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  messageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  configActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  configBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  configBtnPrimary: {
    flex: 1,
    justifyContent: "center",
    borderWidth: 0,
  },
  configBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 0.5,
  },
  hintText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
});
