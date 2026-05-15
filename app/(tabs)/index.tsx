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
import { useSync } from "@/lib/sync-context";
import { useAuth } from "@/lib/auth-context";
import type { RunSheet, TransportLeg } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
  getCachedBundle,
} from "@/lib/offline-store";
import { LinearGradient } from "expo-linear-gradient";
import { useLiveLocation } from "@/lib/live-location";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";

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
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function RunSheetsScreen() {
  const router = useRouter();
  const { isOnline } = useSync();
  const { auth } = useAuth();
  const { isEnabled: liveLocEnabled, isTracking, pendingQueueCount, isSyncingQueue } = useLiveLocation();
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

  const filteredSheets = useMemo(() => {
    let result = sheets;

    if (dateFilter !== "all") {
      const cutoff = dateFilter === "today" ? getStartOfDay() : getStartOfWeek();
      result = result.filter((s) => {
        if (!s.run_date) return false;
        try {
          return new Date(s.run_date) >= cutoff;
        } catch {
          return false;
        }
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((s) => {
        const searchable = [s.name, s.route_name, s.vehicle, s.run_type, s.status]
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
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Dispatched": return BLUE;
      case "In-Progress": return ORANGE;
      case "Completed": return "#34C759";
      default: return "#8E8E93";
    }
  };

  const renderItem = ({ item }: { item: RunSheet }) => {
    const isActive = item.status === "Dispatched" || item.status === "In-Progress";
    const statusColor = getStatusColor(item.status);
    const progress = legProgressMap[item.name];

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({ pathname: "/run-sheet/[id]", params: { id: item.name } })
        }
        activeOpacity={0.7}
        style={[
          styles.card,
          {
            borderLeftColor: statusColor,
            borderLeftWidth: 4,
          },
        ]}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdContainer}>
            {isActive && <View style={[styles.activePulse, { backgroundColor: statusColor }]} />}
            <Text style={styles.cardId} numberOfLines={1}>{item.name}</Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {item.route_name ? (
          <Text style={styles.routeName} numberOfLines={1}>{item.route_name}</Text>
        ) : null}

        {progress && progress.total > 0 ? (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: progress.completed === progress.total ? "#34C759" : BLUE,
                    width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.completed}/{progress.total} legs
            </Text>
          </View>
        ) : null}

        <View style={styles.cardInfoRow}>
          <View style={styles.infoItem}>
            <MaterialIcons name="event" size={15} color="#8E8E93" />
            <Text style={styles.infoText}>{formatDate(item.run_date)}</Text>
          </View>
          {item.vehicle ? (
            <View style={styles.infoItem}>
              <MaterialIcons name="local-shipping" size={15} color="#8E8E93" />
              <Text style={styles.infoText}>{item.vehicle}</Text>
            </View>
          ) : null}
          {item.run_type ? (
            <View style={styles.infoItem}>
              <MaterialIcons name="label" size={15} color="#8E8E93" />
              <Text style={styles.infoText}>{item.run_type}</Text>
            </View>
          ) : null}
          <View style={styles.cardArrow}>
            <MaterialIcons name="chevron-right" size={22} color="#C7C7CC" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcons name="description" size={48} color="#C7C7CC" />
        </View>
        <Text style={styles.emptyTitle}>No Run Sheets Found</Text>
        <Text style={styles.emptySubtitle}>
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
    <ScreenContainer containerClassName="bg-white">
      {/* Blue gradient header */}
      <LinearGradient
        colors={[BLUE, BLUE_LIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientHeader}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Run Sheets</Text>
            {auth?.driverName ? (
              <Text style={styles.headerSubtitle}>{auth.driverName}</Text>
            ) : auth?.fullName ? (
              <Text style={styles.headerSubtitle}>{auth.fullName}</Text>
            ) : null}
          </View>
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <MaterialIcons name="cloud-off" size={14} color="#fff" />
              <Text style={styles.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Search + Filters on white */}
      <View style={styles.filterArea}>
        <View style={styles.searchBar}>
          <MaterialIcons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, route, vehicle..."
            placeholderTextColor="#C7C7CC"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== "ios" && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
              <MaterialIcons name="close" size={18} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>

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
                    backgroundColor: isSelected ? BLUE : "transparent",
                    borderColor: isSelected ? BLUE : "#E5E5EA",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: isSelected ? "#fff" : "#8E8E93" },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.filterCountContainer}>
            <Text style={styles.filterCountText}>
              {filteredSheets.length} {filteredSheets.length === 1 ? "sheet" : "sheets"}
            </Text>
          </View>
        </View>
      </View>

      <ConnectivityBanner />

      {/* Live Location Status Banner */}
      {liveLocEnabled && (
        <View style={styles.liveLocBanner}>
          <View style={styles.liveLocDot}>
            <View style={[styles.liveLocDotInner, { backgroundColor: isTracking ? "#34C759" : ORANGE }]} />
          </View>
          <MaterialIcons
            name={isTracking ? "my-location" : "location-searching"}
            size={16}
            color={isTracking ? "#34C759" : ORANGE}
          />
          <Text style={styles.liveLocText}>
            {isTracking ? "Location sharing active" : "Waiting for GPS..."}
          </Text>
          {pendingQueueCount > 0 && (
            <View style={styles.liveLocQueueBadge}>
              <MaterialIcons
                name={isSyncingQueue ? "sync" : "cloud-queue"}
                size={13}
                color="#fff"
              />
              <Text style={styles.liveLocQueueText}>{pendingQueueCount}</Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>Loading run sheets...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSheets}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 32,
            flexGrow: filteredSheets.length === 0 ? 1 : undefined,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadData(true)}
              tintColor={BLUE}
            />
          }
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: "#FFFFFF" }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Header
  gradientHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: ORANGE,
  },
  offlineBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  // Filter area
  filterArea: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F5F5F7",
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 0,
    color: "#1A1A1A",
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
    color: "#8E8E93",
  },

  // Cards
  card: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
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
    color: "#1A1A1A",
    flex: 1,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A1A",
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
    backgroundColor: "#E5E5EA",
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
    color: "#8E8E93",
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
    color: "#8E8E93",
  },
  cardArrow: {
    marginLeft: "auto",
  },

  // Empty
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
    backgroundColor: "#F5F5F7",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  // Live Location Banner
  liveLocBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F0F8FF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5EA",
    gap: 8,
  },
  liveLocDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  liveLocDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveLocText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1A1A1A",
    flex: 1,
  },
  liveLocQueueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: ORANGE,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveLocQueueText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  loadingText: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 12,
  },
});
