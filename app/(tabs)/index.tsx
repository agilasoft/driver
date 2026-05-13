import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import type { RunSheet } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
} from "@/lib/offline-store";

export default function RunSheetsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isOnline } = useSync();
  const [sheets, setSheets] = useState<RunSheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      if (isOnline) {
        const data = await refreshRunSheets();
        setSheets(data);
      } else {
        const cached = await getCachedRunSheets();
        setSheets(cached);
      }
    } catch (error) {
      // Fallback to cache
      const cached = await getCachedRunSheets();
      setSheets(cached);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isOnline]);

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
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: RunSheet }) => (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/run-sheet/[id]",
          params: { id: item.name },
        })
      }
      style={({ pressed }) => [pressed ? { opacity: 0.7 } : {}]}
    >
      <View className="bg-surface rounded-2xl p-4 mx-4 mb-3 border border-border">
        {/* Header row */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-base font-bold text-foreground" numberOfLines={1}>
            {item.name}
          </Text>
          <StatusBadge status={item.status} />
        </View>

        {/* Route name */}
        {item.route_name ? (
          <Text className="text-sm text-muted mb-2" numberOfLines={1}>
            {item.route_name}
          </Text>
        ) : null}

        {/* Info row */}
        <View className="flex-row items-center gap-4">
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="event" size={14} color={colors.muted} />
            <Text className="text-xs text-muted">{formatDate(item.run_date)}</Text>
          </View>
          {item.vehicle ? (
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="local-shipping" size={14} color={colors.muted} />
              <Text className="text-xs text-muted">{item.vehicle}</Text>
            </View>
          ) : null}
          {item.run_type ? (
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="label" size={14} color={colors.muted} />
              <Text className="text-xs text-muted">{item.run_type}</Text>
            </View>
          ) : null}
        </View>

        {/* Driver info */}
        {item.driver_name ? (
          <View className="flex-row items-center gap-1 mt-2">
            <MaterialIcons name="person" size={14} color={colors.muted} />
            <Text className="text-xs text-muted">{item.driver_name}</Text>
          </View>
        ) : null}

        {/* Chevron */}
        <View className="absolute right-4 top-0 bottom-0 justify-center">
          <MaterialIcons name="chevron-right" size={20} color={colors.border} />
        </View>
      </View>
    </Pressable>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View className="flex-1 items-center justify-center py-20">
        <MaterialIcons name="description" size={48} color={colors.border} />
        <Text className="text-base text-muted mt-4">No run sheets found</Text>
        <Text className="text-sm text-muted mt-1">
          Pull down to refresh
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-2xl font-bold text-foreground">Run Sheets</Text>
      </View>

      <ConnectivityBanner />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-sm text-muted mt-3">Loading run sheets...</Text>
        </View>
      ) : (
        <FlatList
          data={sheets}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 20, flexGrow: sheets.length === 0 ? 1 : undefined }}
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
  );
}
