import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import { useAuth } from "@/lib/auth-context";
import type { RunSheet } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
} from "@/lib/offline-store";

type DateFilter = "today" | "week" | "all";

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function RunSheetsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isOnline } = useSync();
  const { auth } = useAuth();
  const [sheets, setSheets] = useState<RunSheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

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

  // Apply client-side date filter
  const filteredSheets = useMemo(() => {
    if (dateFilter === "all") return sheets;

    const cutoff = dateFilter === "today" ? getStartOfDay() : getStartOfWeek();

    return sheets.filter((s) => {
      if (!s.run_date) return false;
      try {
        const runDate = new Date(s.run_date);
        return runDate >= cutoff;
      } catch {
        return false;
      }
    });
  }, [sheets, dateFilter]);

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
          {dateFilter !== "all"
            ? "Try selecting a different date range"
            : auth?.driverId
            ? "No run sheets assigned to you"
            : "Pull down to refresh"}
        </Text>
      </View>
    );
  };

  const filterOptions: { key: DateFilter; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "all", label: "All" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-2 pb-2">
        <Text className="text-2xl font-bold text-foreground">Run Sheets</Text>
        {auth?.driverName ? (
          <Text className="text-sm text-muted mt-0.5">{auth.driverName}</Text>
        ) : auth?.fullName ? (
          <Text className="text-sm text-muted mt-0.5">{auth.fullName}</Text>
        ) : null}
      </View>

      {/* Date Filter Chips */}
      <View className="flex-row gap-2 px-4 pb-3">
        {filterOptions.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setDateFilter(opt.key)}
            activeOpacity={0.7}
            style={[
              {
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: dateFilter === opt.key ? colors.primary : colors.border,
                backgroundColor: dateFilter === opt.key ? colors.primary : colors.surface,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: dateFilter === opt.key ? "#fff" : colors.muted,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        {dateFilter !== "all" ? (
          <View className="flex-1 items-end justify-center">
            <Text className="text-xs text-muted">
              {filteredSheets.length} of {sheets.length}
            </Text>
          </View>
        ) : null}
      </View>

      <ConnectivityBanner />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-sm text-muted mt-3">Loading run sheets...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSheets}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 20, flexGrow: filteredSheets.length === 0 ? 1 : undefined }}
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
