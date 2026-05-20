import React from "react";
import { View, Text, StyleSheet } from "react-native";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: "#E5E5EA", fg: "#8E8E93" },
  Dispatched: { bg: "#E3F2FD", fg: "#3478C6" },
  "In-Progress": { bg: "#FFF3E0", fg: "#F27A2E" },
  Completed: { bg: "#E8F5E9", fg: "#34C759" },
  Hold: { bg: "#FFF8E1", fg: "#FF9500" },
  Cancelled: { bg: "#FFEBEE", fg: "#FF3B30" },
};

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return (
    <View style={[st.badge, { backgroundColor: colors.bg }]}>
      <Text style={[st.text, { color: colors.fg }]}>{status}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  text: { fontSize: 12, fontWeight: "700" },
});
