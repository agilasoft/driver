import React from "react";
import { View, Text } from "react-native";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Draft: { bg: "bg-border", text: "text-foreground" },
  Dispatched: { bg: "bg-primary", text: "text-white" },
  "In-Progress": { bg: "bg-warning", text: "text-white" },
  Hold: { bg: "bg-error", text: "text-white" },
  Completed: { bg: "bg-success", text: "text-white" },
  Cancelled: { bg: "bg-error", text: "text-white" },
  Open: { bg: "bg-border", text: "text-foreground" },
  Assigned: { bg: "bg-primary", text: "text-white" },
  Started: { bg: "bg-warning", text: "text-white" },
  Billed: { bg: "bg-success", text: "text-white" },
};

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || {
    bg: "bg-border",
    text: "text-foreground",
  };

  return (
    <View className={`${colors.bg} rounded-full px-3 py-1`}>
      <Text className={`${colors.text} text-xs font-semibold`}>{status}</Text>
    </View>
  );
}
