import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import { useAuth } from "@/lib/auth-context";
import type { RunSheet, TransportLeg } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
  getCachedBundle,
} from "@/lib/offline-store";

type DateFilter = "today" | "week" | "all";

interface LegProgress {
  total: number;
  completed: number;
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [legProgressMap, setLegProgressMap] = useState<Record<string, LegProgress>>({});

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        let data: RunSheet[];
        if (isOnline) {
          data = await refreshRunSheets();
        } else {
          data = await getCachedRunSheets();
        }
        setSheets(data);

        // Load leg progress from cached bundles
        const progressMap: Record<string, LegProgress> = {};
        for (const sheet of data) {
          try {
            const bundle = await getCachedBundle(sheet.name);
            if (bundle && bundle.legs) {
              const total = bundle.legs.length;
              const completed = bundle.legs.filter(
                (l: TransportLeg) => l.status === "Completed" || l.status === "Billed"
              ).length;
              progressMap[sheet.name] = { total, completed };
            }
          } catch {
            // Skip
          }
        }
        setLegProgressMap(progressMap);
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

  // Apply client-side date filter and search
  const filteredSheets = useMemo(() => {
    let result = sheets;

    // Date filter
    if (dateFilter !== "all") {
      const cutoff = dateFilter === "today" ? getStartOfDay() : getStartOfWeek();
      result = result.filter((s) => {
        if (!s.run_date) return false;
        try {
          const runDate = new Date(s.run_date);
          return runDate >= cutoff;
        } catch {
          return false;
        }
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const searchable = [
          s.name,
          s.route_name,
          s.vehicle,
          s.run_type,
          s.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    return result;
  }, [sheets, dateFilter, searchQuery]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Dispatched":
        return colors.primary;
      case "In-Progress":
        return colors.warning;
      case "Completed":
        return colors.success;
      default:
        return colors.muted;
    }
  };

  const renderItem = ({ item }: { item: RunSheet }) => {
    const isActive =
      item.status === "Dispatched" || item.status === "In-Progress";
    const statusColor = getStatusColor(item.status);
    const progress = legProgressMap[item.name];

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
            borderLeftColor: statusColor,
            borderLeftWidth: 4,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
              },
              android: { elevation: 2 },
            }),
          },
        ]}
      >
        {/* Top row: ID + Status */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdContainer}>
            {isActive && (
              <View
                style={[styles.activePulse, { backgroundColor: statusColor }]}
              />
            )}
            <Text
              style={[styles.cardId, { color: colors.foreground }]}
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

        {/* Leg Progress Bar */}
        {progress && progress.total > 0 ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border + "40" }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: progress.completed === progress.total ? colors.success : colors.primary,
                    width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.muted }]}>
              {progress.completed}/{progress.total} legs
            </Text>
          </View>
        ) : null}

        {/* Bottom info row */}
        <View style={styles.cardInfoRow}>
          <View style={styles.infoItem}>
            <MaterialIcons name="event" size={15} color={colors.muted} />
            <Text style={[styles.infoText, { color: colors.muted }]}>
              {formatDate(item.run_date)}
            </Text>
          </View>
          {item.vehicle ? (
            <View style={styles.infoItem}>
              <MaterialIcons
                name="local-shipping"
                size={15}
                color={colors.muted}
              />
              <Text style={[styles.infoText, { color: colors.muted }]}>
                {item.vehicle}
              </Text>
            </View>
          ) : null}
          {item.run_type ? (
            <View style={styles.infoItem}>
              <MaterialIcons name="label" size={15} color={colors.muted} />
              <Text style={[styles.infoText, { color: colors.muted }]}>
                {item.run_type}
              </Text>
            </View>
          ) : null}
          <View style={styles.cardArrow}>
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={colors.border}
            />
          </View>
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
          <MaterialIcons name="description" size={48} color={colors.border} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          No Run Sheets Found
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
          {searchQuery
            ? `No results for "${searchQuery}"`
            : dateFilter !== "all"
            ? "Try selecting a different date range"
            : auth?.driverId
            ? "No run sheets assigned to you yet"
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
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View>
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
          {!isOnline && (
            <View style={[styles.offlineBadge, { backgroundColor: colors.warning }]}>
              <MaterialIcons name="cloud-off" size={14} color="#fff" />
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <MaterialIcons name="search" size={20} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search by name, route, vehicle..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearButton}
            >
              <MaterialIcons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Date Filter Pills */}
        <View style={styles.filterRow}>
          {filterOptions.map((opt) => {
            const isSelected = dateFilter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setDateFilter(opt.key)}
                activeOpacity={0.7}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected
                      ? colors.primary
                      : "transparent",
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isSelected ? "#fff" : colors.muted },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.filterCountContainer}>
            <Text style={[styles.filterCountText, { color: colors.muted }]}>
              {filteredSheets.length} {filteredSheets.length === 1 ? "sheet" : "sheets"}
            </Text>
          </View>
        </View>
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
            paddingTop: 12,
            paddingBottom: 32,
            flexGrow: filteredSheets.length === 0 ? 1 : undefined,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  offlineBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterCountContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: "500",
  },
  card: {
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardIdContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  activePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardId: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 10,
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    minWidth: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "600",
    minWidth: 52,
    textAlign: "right",
  },
  cardInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardArrow: {
    marginLeft: "auto",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
