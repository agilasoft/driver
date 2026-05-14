import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
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

  const loadData = useCallback(
    async (showRefresh = false) => {
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
      } catch {
        const cached = await getCachedRunSheets();
        setSheets(cached);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isOnline]
  );

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

  const renderItem = ({ item }: { item: RunSheet }) => {
    const isActive =
      item.status === "Dispatched" || item.status === "In-Progress";
    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/run-sheet/[id]",
            params: { id: item.name },
          })
        }
        activeOpacity={0.7}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: isActive ? colors.primary : colors.border,
            borderWidth: isActive ? 1.5 : 1,
          },
        ]}
      >
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            {isActive && (
              <View
                style={[styles.activeDot, { backgroundColor: colors.primary }]}
              />
            )}
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {/* Route name */}
        {item.route_name ? (
          <Text
            style={[styles.routeName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {item.route_name}
          </Text>
        ) : null}

        {/* Info chips row */}
        <View style={styles.infoRow}>
          <View style={[styles.infoChip, { backgroundColor: colors.background }]}>
            <MaterialIcons name="event" size={14} color={colors.muted} />
            <Text style={[styles.infoChipText, { color: colors.muted }]}>
              {formatDate(item.run_date)}
            </Text>
          </View>
          {item.vehicle ? (
            <View
              style={[styles.infoChip, { backgroundColor: colors.background }]}
            >
              <MaterialIcons
                name="local-shipping"
                size={14}
                color={colors.muted}
              />
              <Text style={[styles.infoChipText, { color: colors.muted }]}>
                {item.vehicle}
              </Text>
            </View>
          ) : null}
          {item.run_type ? (
            <View
              style={[styles.infoChip, { backgroundColor: colors.background }]}
            >
              <MaterialIcons name="label" size={14} color={colors.muted} />
              <Text style={[styles.infoChipText, { color: colors.muted }]}>
                {item.run_type}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Chevron */}
        <View style={styles.chevron}>
          <MaterialIcons name="chevron-right" size={22} color={colors.border} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View
          style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}
        >
          <MaterialIcons name="description" size={44} color={colors.border} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          No Run Sheets
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
          {dateFilter !== "all"
            ? "Try selecting a different date range"
            : auth?.driverId
            ? "No run sheets assigned to you"
            : "Pull down to refresh"}
        </Text>
      </View>
    );
  };

  const filterOptions: { key: DateFilter; label: string; icon: string }[] = [
    { key: "today", label: "Today", icon: "today" },
    { key: "week", label: "This Week", icon: "date-range" },
    { key: "all", label: "All", icon: "list" },
  ];

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Run Sheets
        </Text>
        {auth?.driverName ? (
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            {auth.driverName}
          </Text>
        ) : auth?.fullName ? (
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            {auth.fullName}
          </Text>
        ) : null}
      </View>

      {/* Date Filter Chips */}
      <View style={styles.filterRow}>
        {filterOptions.map((opt) => {
          const isSelected = dateFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setDateFilter(opt.key)}
              activeOpacity={0.7}
              style={[
                styles.filterChip,
                {
                  borderColor: isSelected ? colors.primary : colors.border,
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                },
              ]}
            >
              <MaterialIcons
                name={opt.icon as any}
                size={16}
                color={isSelected ? "#fff" : colors.muted}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? "#fff" : colors.muted },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {dateFilter !== "all" ? (
          <View style={styles.filterCount}>
            <Text style={[styles.filterCountText, { color: colors.muted }]}>
              {filteredSheets.length}/{sheets.length}
            </Text>
          </View>
        ) : null}
      </View>

      <ConnectivityBanner />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Loading run sheets...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSheets}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 24,
            flexGrow: filteredSheets.length === 0 ? 1 : undefined,
          }}
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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterCount: {
    flex: 1,
    alignItems: "flex-end",
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: "500",
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingRight: 24,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  infoChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  chevron: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
});
