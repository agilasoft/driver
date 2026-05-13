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
import {
  requestNotificationPermissions,
  startAssignmentPolling,
  stopAssignmentPolling,
} from "@/lib/notifications";

export default function SettingsScreen() {
  const { auth, logout, updateCredentials } = useAuth();
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const colors = useColors();
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Configuration editing state
  const [configExpanded, setConfigExpanded] = useState(false);
  const [editSiteUrl, setEditSiteUrl] = useState(auth?.siteUrl || "");
  const [editApiKey, setEditApiKey] = useState(auth?.apiKey || "");
  const [editApiSecret, setEditApiSecret] = useState(auth?.apiSecret || "");
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  // Sync form fields with auth state when it changes
  useEffect(() => {
    if (auth) {
      setEditSiteUrl(auth.siteUrl);
      setEditApiKey(auth.apiKey);
      setEditApiSecret(auth.apiSecret);
      setConfigDirty(false);
    }
  }, [auth]);

  // Track if any field has changed
  useEffect(() => {
    if (!auth) return;
    const dirty =
      editSiteUrl.trim() !== auth.siteUrl ||
      editApiKey.trim() !== auth.apiKey ||
      editApiSecret.trim() !== auth.apiSecret;
    setConfigDirty(dirty);
  }, [editSiteUrl, editApiKey, editApiSecret, auth]);

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
        Alert.alert("Notifications Enabled", "You will be notified when new run sheets are assigned to you.");
      } else {
        Alert.alert("Permission Required", "Please enable notifications in your device settings.");
      }
    }
  };

  const handleSaveConfig = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();

    if (!url) {
      Alert.alert("Validation Error", "Server URL is required.");
      return;
    }
    if (!key) {
      Alert.alert("Validation Error", "API Key is required.");
      return;
    }
    if (!secret) {
      Alert.alert("Validation Error", "API Secret is required.");
      return;
    }

    setIsSaving(true);
    try {
      await updateCredentials(url, key, secret);
      setConfigDirty(false);
      Alert.alert("Configuration Saved", "Your connection settings have been verified and saved successfully.");
    } catch (error: any) {
      Alert.alert(
        "Connection Failed",
        error?.message || "Could not connect with the provided credentials. Please check your settings and try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetConfig = () => {
    if (auth) {
      setEditSiteUrl(auth.siteUrl);
      setEditApiKey(auth.apiKey);
      setEditApiSecret(auth.apiSecret);
    }
  };

  const handleTestConnection = async () => {
    const url = editSiteUrl.trim();
    const key = editApiKey.trim();
    const secret = editApiSecret.trim();

    if (!url || !key || !secret) {
      Alert.alert("Missing Fields", "Please fill in all connection fields before testing.");
      return;
    }

    setIsSaving(true);
    try {
      const baseUrl = url.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
        method: "GET",
        headers: {
          Authorization: `token ${key}:${secret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert("Connection Successful", `Connected as: ${data.message || "Unknown"}`);
      } else {
        Alert.alert("Connection Failed", `Server returned status ${res.status}. Check your credentials.`);
      }
    } catch (error: any) {
      Alert.alert("Connection Error", error?.message || "Could not reach the server. Check the URL and your network.");
    } finally {
      setIsSaving(false);
    }
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

  // Mask the API secret for display
  const maskedSecret = (s: string) => {
    if (!s) return "";
    if (s.length <= 8) return "****";
    return s.substring(0, 4) + "****" + s.substring(s.length - 4);
  };

  return (
    <ScreenContainer className="px-4 pt-2">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-foreground mb-6">Settings</Text>

        {/* User Info */}
        <View className="bg-surface rounded-2xl p-4 border border-border mb-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-lg font-bold">
                {(auth?.fullName || auth?.userName || "?").charAt(0).toUpperCase()}
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
              <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                {auth?.siteUrl}
              </Text>
            </View>
            {auth?.driverId ? (
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="badge" size={16} color={colors.primary} />
                <Text className="text-xs text-primary flex-1" numberOfLines={1}>
                  Driver: {auth.driverName || auth.driverId}
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="warning" size={16} color={colors.warning} />
                <Text className="text-xs text-warning flex-1" numberOfLines={2}>
                  No Driver record linked to this user. All run sheets will be shown.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Configuration */}
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">CONFIGURATION</Text>
        <View className="bg-surface rounded-2xl border border-border mb-4 overflow-hidden">
          {/* Collapsed summary */}
          <TouchableOpacity
            style={styles.configHeader}
            onPress={() => setConfigExpanded(!configExpanded)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="settings-ethernet" size={20} color={colors.primary} />
            <View style={styles.configHeaderText}>
              <Text className="text-sm font-medium text-foreground">Server Connection</Text>
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
            <View style={styles.configBody}>
              {/* Server URL */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Server URL</Text>
                <View style={[styles.inputRow, { borderColor: colors.border }]}>
                  <MaterialIcons name="language" size={18} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editSiteUrl}
                    onChangeText={setEditSiteUrl}
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
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>API Key</Text>
                <View style={[styles.inputRow, { borderColor: colors.border }]}>
                  <MaterialIcons name="vpn-key" size={18} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editApiKey}
                    onChangeText={setEditApiKey}
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
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>API Secret</Text>
                <View style={[styles.inputRow, { borderColor: colors.border }]}>
                  <MaterialIcons name="lock" size={18} color={colors.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={editApiSecret}
                    onChangeText={setEditApiSecret}
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
                      size={20}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.configActions}>
                <TouchableOpacity
                  style={[styles.configBtn, { borderColor: colors.border }]}
                  onPress={handleTestConnection}
                  disabled={isSaving}
                  activeOpacity={0.7}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <MaterialIcons name="wifi-tethering" size={16} color={colors.primary} />
                  )}
                  <Text style={[styles.configBtnText, { color: colors.primary }]}>Test</Text>
                </TouchableOpacity>

                {configDirty && (
                  <TouchableOpacity
                    style={[styles.configBtn, { borderColor: colors.border }]}
                    onPress={handleResetConfig}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="undo" size={16} color={colors.muted} />
                    <Text style={[styles.configBtnText, { color: colors.muted }]}>Reset</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.configBtn,
                    styles.configBtnPrimary,
                    { backgroundColor: configDirty ? colors.primary : colors.border },
                  ]}
                  onPress={handleSaveConfig}
                  disabled={isSaving || !configDirty}
                  activeOpacity={0.7}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="save" size={16} color={configDirty ? "#fff" : colors.muted} />
                  )}
                  <Text
                    style={[
                      styles.configBtnText,
                      { color: configDirty ? "#fff" : colors.muted },
                    ]}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Connection info hint */}
              <View style={[styles.hintBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <MaterialIcons name="info-outline" size={14} color={colors.muted} />
                <Text style={[styles.hintText, { color: colors.muted }]}>
                  Generate API keys in your Frappe site under Settings {'>'} API Access. The server URL should include the protocol (https://).
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Sync Status */}
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">SYNC</Text>
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
        <Text className="text-sm font-semibold text-muted mb-2 ml-1">NOTIFICATIONS</Text>
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
              name={notifEnabled ? "notifications-off" : "notifications-active"}
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
          Driver v1.2.0
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
    borderTopColor: "#E5E7EB",
  },
  fieldGroup: {
    gap: 6,
    marginTop: 2,
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
  configActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
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
