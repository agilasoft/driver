import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";
import { getCachedBundle, refreshBundle } from "@/lib/offline-store";

export default function RunSheetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { isOnline } = useSync();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (!id) return;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        if (isOnline) {
          const data = await refreshBundle(id);
          setBundle(data);
        } else {
          const cached = await getCachedBundle(id);
          setBundle(cached);
        }
      } catch {
        const cached = await getCachedBundle(id);
        setBundle(cached);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id, isOnline]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const hasCapture = (leg: TransportLeg, type: "pick" | "drop") => {
    if (type === "pick") {
      return !!leg.pick_signature || !!leg.start_date;
    }
    return !!leg.drop_signature || !!leg.end_date;
  };

  const renderLeg = ({ item, index }: { item: TransportLeg; index: number }) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/leg/[legId]",
          params: { legId: item.name, runSheetId: id! },
        })
      }
      style={({ pressed }) => [pressed ? { opacity: 0.7 } : {}]}
    >
      <View className="bg-surface rounded-2xl p-4 mx-4 mb-3 border border-border">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-xs font-bold">{index + 1}</Text>
            </View>
            <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {/* Route */}
        <View className="flex-row items-center gap-2 mb-2">
          <View className="flex-1">
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="trip-origin" size={14} color={colors.success} />
              <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                {item.facility_from || "Pick-up"}
              </Text>
            </View>
            <View className="ml-1.5 border-l border-border h-3" />
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="place" size={14} color={colors.error} />
              <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                {item.facility_to || "Drop-off"}
              </Text>
            </View>
          </View>
        </View>

        {/* Capture indicators */}
        <View className="flex-row items-center gap-4 mt-1">
          <View className="flex-row items-center gap-1">
            <MaterialIcons
              name="draw"
              size={14}
              color={hasCapture(item, "pick") ? colors.success : colors.border}
            />
            <Text
              className={`text-xs ${
                hasCapture(item, "pick") ? "text-success" : "text-muted"
              }`}
            >
              Pick
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <MaterialIcons
              name="draw"
              size={14}
              color={hasCapture(item, "drop") ? colors.success : colors.border}
            />
            <Text
              className={`text-xs ${
                hasCapture(item, "drop") ? "text-success" : "text-muted"
              }`}
            >
              Drop
            </Text>
          </View>
          {item.distance_km ? (
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="straighten" size={14} color={colors.muted} />
              <Text className="text-xs text-muted">
                {item.distance_km.toFixed(1)} km
              </Text>
            </View>
          ) : null}
        </View>

        {/* Chevron */}
        <View className="absolute right-4 top-0 bottom-0 justify-center">
          <MaterialIcons name="chevron-right" size={20} color={colors.border} />
        </View>
      </View>
    </Pressable>
  );

  const renderHeader = () => {
    if (!bundle) return null;
    const doc = bundle.doc;
    return (
      <View className="mx-4 mb-4">
        <View className="bg-surface rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground">{doc.name}</Text>
            <StatusBadge status={doc.status} />
          </View>

          {doc.route_name ? (
            <Text className="text-sm text-foreground mb-2">{doc.route_name}</Text>
          ) : null}

          <View className="gap-2">
            <InfoRow icon="event" label="Date" value={formatDate(doc.run_date)} colors={colors} />
            <InfoRow icon="label" label="Type" value={doc.run_type} colors={colors} />
            <InfoRow icon="local-shipping" label="Vehicle" value={doc.vehicle || "—"} colors={colors} />
            <InfoRow icon="person" label="Driver" value={doc.driver_name || "—"} colors={colors} />
            {doc.dispatch_terminal ? (
              <InfoRow icon="warehouse" label="Dispatch" value={doc.dispatch_terminal} colors={colors} />
            ) : null}
          </View>
        </View>

        <Text className="text-base font-semibold text-foreground mt-5 mb-2 ml-1">
          Transport Legs ({bundle.legs.length})
        </Text>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: id || "Run Sheet",
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
        }}
      />
      <ScreenContainer edges={["left", "right"]}>
        <ConnectivityBanner />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-sm text-muted mt-3">Loading...</Text>
          </View>
        ) : !bundle ? (
          <View className="flex-1 items-center justify-center">
            <MaterialIcons name="error-outline" size={48} color={colors.border} />
            <Text className="text-base text-muted mt-4">
              Could not load run sheet
            </Text>
          </View>
        ) : (
          <FlatList
            data={bundle.legs}
            keyExtractor={(item) => item.name}
            renderItem={renderLeg}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 20 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadData(true)}
                tintColor={colors.primary}
              />
            }
          />
        )}
      </ScreenContainer>
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <MaterialIcons name={icon as any} size={16} color={colors.muted} />
      <Text className="text-xs text-muted w-16">{label}</Text>
      <Text className="text-sm text-foreground flex-1">{value}</Text>
    </View>
  );
}
