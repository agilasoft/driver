import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useSync } from "@/lib/sync-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export function ConnectivityBanner() {
  const { isOnline, pendingCount, isSyncing, syncNow } = useSync();

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  const bgColor = !isOnline
    ? "bg-error"
    : isSyncing
    ? "bg-warning"
    : pendingCount > 0
    ? "bg-primary"
    : "bg-success";

  const message = !isOnline
    ? `Offline — ${pendingCount} pending`
    : isSyncing
    ? "Syncing..."
    : pendingCount > 0
    ? `${pendingCount} pending — tap to sync`
    : "All synced";

  const iconName = !isOnline
    ? "cloud-off"
    : isSyncing
    ? "cloud-upload"
    : "cloud-queue";

  return (
    <Pressable
      onPress={isOnline && pendingCount > 0 && !isSyncing ? syncNow : undefined}
      style={({ pressed }) => [
        pressed && isOnline && pendingCount > 0 ? { opacity: 0.8 } : {},
      ]}
    >
      <View className={`${bgColor} flex-row items-center justify-center py-2 px-4`}>
        {isSyncing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialIcons name={iconName as any} size={16} color="#fff" />
        )}
        <Text className="text-white text-xs font-medium ml-2">{message}</Text>
      </View>
    </Pressable>
  );
}
