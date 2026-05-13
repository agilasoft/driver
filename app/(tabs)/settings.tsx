import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
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
  const { auth, logout } = useAuth();
  const { isOnline, pendingCount, isSyncing, lastSync, syncNow } = useSync();
  const colors = useColors();
  const [notifEnabled, setNotifEnabled] = useState(false);

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
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings."
        );
      }
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

  return (
    <ScreenContainer className="px-4 pt-2">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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

        {/* Version */}
        <Text className="text-xs text-muted text-center mt-6">
          Driver v1.1.0
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
