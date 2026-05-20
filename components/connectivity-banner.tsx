import React from "react";
import { View, Text, StyleSheet } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSync } from "@/lib/sync-context";

export function ConnectivityBanner() {
  const { isOnline, pendingCount, isSyncing } = useSync();
  if (isOnline && pendingCount === 0) return null;
  return (
    <View style={[st.banner, { backgroundColor: isOnline ? "#FF9500" : "#FF3B30" }]}>
      <MaterialIcons name={isOnline ? "sync" : "cloud-off"} size={14} color="#fff" />
      <Text style={st.text}>
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  text: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
