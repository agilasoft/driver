import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
import { useCurrentJob } from "@/lib/current-job";
import type { RunSheet, TransportLeg } from "@/lib/types";
import {
  getCachedRunSheets,
  refreshRunSheets,
  getCachedBundle,
} from "@/lib/offline-store";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const GREEN = "#34C759";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const FG = "#1A1A1A";

interface LegProgress {
  total: number;
  completed: number;
}

export default function RunSheetsScreen() {
  const router = useRouter();
  const { isOnline } = useSync();
  const { auth } = useAuth();
  const { currentJobId, setCurrentJob } = useCurrentJob();
  const insets = useSafeAreaInsets();
  const [sheets, setSheets] = useState<RunSheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
                (l: TransportLeg) => l.status === "Completed" || l.status === "Billed" ||
                  ((l.pick_signature || l.start_date) && (l.drop_signature || l.end_date))
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

  const handleSelectJob = (sheet: RunSheet) => {
    const isCurrent = currentJobId === sheet.name;
    if (isCurrent) {
      // Already current, navigate to current job tab
      router.navigate("/(tabs)");
      return;
    }

    Alert.alert(
      "Set as Current Job?",
      `Make "${sheet.route_name || sheet.name}" your active job?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Set Active",
          onPress: async () => {
            await setCurrentJob(sheet.name);
            router.navigate("/(tabs)");
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: RunSheet }) => {
    const isCurrent = currentJobId === item.name;
    const progress = legProgressMap[item.name];
    const isComplete = progress && progress.total > 0 && progress.completed === progress.total;

    return (
      <TouchableOpacity
        onPress={() => handleSelectJob(item)}
        activeOpacity={0.7}
        style={[
          st.card,
          isCurrent && st.cardCurrent,
        ]}
      >
        <View style={st.cardTopRow}>
          <View style={st.cardLeft}>
            {isCurrent && (
              <View style={st.currentBadge}>
                <Text style={st.currentBadgeText}>ACTIVE</Text>
              </View>
            )}
            <Text style={st.cardTitle} numberOfLines={1}>
              {item.route_name || item.name}
            </Text>
            <Text style={st.cardId}>{item.name}</Text>
          </View>
          <View style={st.cardRight}>
            {isComplete ? (
              <MaterialIcons name="check-circle" size={24} color={GREEN} />
            ) : isCurrent ? (
              <View style={st.activeIndicator}>
                <MaterialIcons name="play-arrow" size={20} color="#fff" />
              </View>
            ) : (
              <View style={st.selectBtn}>
                <Text style={st.selectBtnText}>Select</Text>
              </View>
            )}
          </View>
        </View>

        {/* Progress */}
        {progress && progress.total > 0 ? (
          <View style={st.progressRow}>
            <View style={st.progressTrack}>
              <View
                style={[
                  st.progressFill,
                  {
                    backgroundColor: isComplete ? GREEN : BLUE,
                    width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={st.progressText}>
              {progress.completed}/{progress.total}
            </Text>
          </View>
        ) : null}

        {/* Info row */}
        <View style={st.infoRow}>
          <View style={st.infoItem}>
            <MaterialIcons name="event" size={14} color={GRAY} />
            <Text style={st.infoText}>{formatDate(item.run_date)}</Text>
          </View>
          {item.vehicle ? (
            <View style={st.infoItem}>
              <MaterialIcons name="local-shipping" size={14} color={GRAY} />
              <Text style={st.infoText}>{item.vehicle}</Text>
            </View>
          ) : null}
          <StatusBadge status={item.status} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={st.emptyContainer}>
        <View style={st.emptyIconCircle}>
          <MaterialIcons name="description" size={48} color="#C7C7CC" />
        </View>
        <Text style={st.emptyTitle}>No Run Sheets</Text>
        <Text style={st.emptySubtitle}>
          {auth?.driverId
            ? "No run sheets assigned to you yet. Pull down to refresh."
            : "Pull down to refresh"}
        </Text>
      </View>
    );
  };

  return (
    <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
      {/* Header */}
      <LinearGradient colors={[BLUE, BLUE_LIGHT]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
        <View style={st.headerRow}>
          <Text style={st.headerTitle}>Run Sheets</Text>
          {!isOnline && (
            <View style={st.offlineBadge}>
              <MaterialIcons name="cloud-off" size={14} color="#fff" />
              <Text style={st.offlineBadgeText}>Offline</Text>
            </View>
          )}
        </View>
        <Text style={st.headerHint}>Select a run sheet to make it your current job</Text>
      </LinearGradient>

      <ConnectivityBanner />

      {isLoading ? (
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={st.loadingText}>Loading run sheets...</Text>
        </View>
      ) : (
        <FlatList
          data={sheets}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: 32,
            paddingHorizontal: 16,
            flexGrow: sheets.length === 0 ? 1 : undefined,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} tintColor={BLUE} />
          }
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: "#FFFFFF" }}
        />
      )}
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerHint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
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

  // Cards
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
  },
  cardCurrent: {
    borderColor: BLUE,
    borderWidth: 2,
    backgroundColor: "#FAFCFF",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardRight: {
    alignItems: "center",
    justifyContent: "center",
  },
  currentBadge: {
    backgroundColor: BLUE,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: FG,
  },
  cardId: {
    fontSize: 12,
    color: GRAY,
    marginTop: 2,
  },
  activeIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  selectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: BLUE,
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: BLUE,
  },

  // Progress
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E5EA",
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    minWidth: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: GRAY,
    minWidth: 32,
  },

  // Info
  infoRow: {
    flexDirection: "row",
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
    color: GRAY,
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
    color: FG,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: GRAY,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    fontSize: 14,
    color: GRAY,
    marginTop: 12,
  },
});
