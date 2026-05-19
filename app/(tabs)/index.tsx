import React, { useState, useCallback, useEffect } from "react";
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
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { useSync } from "@/lib/sync-context";
import { useAuth } from "@/lib/auth-context";
import { useCurrentJob } from "@/lib/current-job";
import { useLiveLocation } from "@/lib/live-location";
import { useShiftLog, formatDuration } from "@/lib/shift-log";
import { useSessionTimeout } from "@/lib/session-timeout";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";
import {
  getCachedBundle,
  refreshBundle,
  addPendingChange,
  applyLocalChange,
} from "@/lib/offline-store";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const GREEN = "#34C759";
const RED = "#FF3B30";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const FG = "#1A1A1A";

export default function CurrentJobScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOnline } = useSync();
  const { auth, activeProfile } = useAuth();
  const { currentJobId } = useCurrentJob();
  const { isEnabled: liveLocEnabled, isTracking } = useLiveLocation();
  const { isClocked, elapsedMs, clockIn, clockOut } = useShiftLog();
  const { recordActivity } = useSessionTimeout();

  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (!currentJobId) {
        setBundle(null);
        setIsLoading(false);
        return;
      }
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        if (isOnline) {
          try {
            const data = await refreshBundle(currentJobId);
            setBundle(data);
          } catch {
            const cached = await getCachedBundle(currentJobId);
            setBundle(cached);
          }
        } else {
          const cached = await getCachedBundle(currentJobId);
          setBundle(cached);
        }
      } catch {
        const cached = await getCachedBundle(currentJobId);
        setBundle(cached);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentJobId, isOnline]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when tab comes into focus
  useFocusEffect(
    useCallback(() => {
      if (currentJobId) loadData();
    }, [currentJobId, loadData])
  );

  // Compute progress
  const completedLegs = bundle?.legs.filter(
    (l) => (l.pick_signature || l.start_date) && (l.drop_signature || l.end_date)
  ).length || 0;
  const totalLegs = bundle?.legs.length || 0;
  const progressPercent = totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0;

  const getNextLeg = (): TransportLeg | null => {
    if (!bundle) return null;
    // Find first leg that's not fully completed
    return bundle.legs.find((l) => {
      const hasPickData = !!l.pick_signature || !!l.start_date;
      const hasDropData = !!l.drop_signature || !!l.end_date;
      return !(hasPickData && hasDropData);
    }) || null;
  };

  const nextLeg = getNextLeg();

  const renderLegItem = ({ item, index }: { item: TransportLeg; index: number }) => {
    const hasPickData = !!item.pick_signature || !!item.start_date;
    const hasDropData = !!item.drop_signature || !!item.end_date;
    const isComplete = hasPickData && hasDropData;
    const isPartial = hasPickData || hasDropData;
    const isNext = nextLeg?.name === item.name;

    return (
      <TouchableOpacity
        onPress={() => { recordActivity(); router.push({ pathname: "/leg/[legId]", params: { legId: item.name, runSheetId: currentJobId || "" } } as any); }}
        activeOpacity={0.7}
        style={[
          st.legCard,
          isNext && st.legCardNext,
          isComplete && st.legCardComplete,
        ]}
      >
        <View style={st.legRow}>
          {/* Status indicator */}
          <View style={[
            st.legStatusCircle,
            { backgroundColor: isComplete ? GREEN : isPartial ? ORANGE : (isNext ? BLUE : BORDER) },
          ]}>
            {isComplete ? (
              <MaterialIcons name="check" size={16} color="#fff" />
            ) : (
              <Text style={st.legNumber}>{index + 1}</Text>
            )}
          </View>

          {/* Leg info */}
          <View style={st.legInfo}>
            <Text style={[st.legTitle, isComplete && st.legTitleComplete]} numberOfLines={1}>
              {item.facility_from || "Pick-up"} → {item.facility_to || "Drop-off"}
            </Text>
            <View style={st.legMeta}>
              {isComplete ? (
                <Text style={st.legMetaComplete}>Completed</Text>
              ) : isPartial ? (
                <Text style={st.legMetaPartial}>In progress</Text>
              ) : isNext ? (
                <Text style={st.legMetaNext}>Next stop</Text>
              ) : (
                <Text style={st.legMetaPending}>Pending</Text>
              )}
            </View>
          </View>

          {/* Action arrow */}
          {!isComplete && (
            <View style={[st.legAction, isNext && st.legActionNext]}>
              <MaterialIcons
                name={isNext ? "arrow-forward" : "chevron-right"}
                size={isNext ? 20 : 22}
                color={isNext ? "#fff" : "#C7C7CC"}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // No current job selected
  if (!currentJobId) {
    return (
      <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
        <LinearGradient colors={[BLUE, BLUE_LIGHT]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
          <Text style={st.headerTitle}>Current Job</Text>
          {auth?.driverName ? <Text style={st.headerSubtitle}>{auth.driverName}</Text> : null}
        </LinearGradient>
        <View style={st.emptyContainer}>
          <View style={st.emptyIconCircle}>
            <MaterialIcons name="local-shipping" size={48} color="#C7C7CC" />
          </View>
          <Text style={st.emptyTitle}>No Active Job</Text>
          <Text style={st.emptySubtitle}>
            Go to the Run Sheets tab to select a job
          </Text>
          <TouchableOpacity
            style={st.emptyBtn}
            onPress={() => router.navigate("/(tabs)/run-sheets")}
            activeOpacity={0.8}
          >
            <MaterialIcons name="list-alt" size={20} color="#fff" />
            <Text style={st.emptyBtnText}>View Run Sheets</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
        <LinearGradient colors={[BLUE, BLUE_LIGHT]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
          <Text style={st.headerTitle}>Current Job</Text>
        </LinearGradient>
        <View style={st.loadingContainer}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={st.loadingText}>Loading job...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
      {/* Header */}
      <LinearGradient colors={[BLUE, BLUE_LIGHT]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.header, { paddingTop: insets.top + 8 }]}>
        <View style={st.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>Current Job</Text>
            {bundle?.doc.route_name ? (
              <Text style={st.headerSubtitle} numberOfLines={1}>{bundle.doc.route_name}</Text>
            ) : bundle?.doc.name ? (
              <Text style={st.headerSubtitle} numberOfLines={1}>{bundle.doc.name}</Text>
            ) : null}
          </View>
          {/* Live location indicator */}
          {liveLocEnabled && isTracking && (
            <View style={st.liveIndicator}>
              <View style={st.liveIndicatorDot} />
              <Text style={st.liveIndicatorText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        <View style={st.progressSection}>
          <View style={st.progressBar}>
            <View style={[st.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={st.progressLabel}>
            {completedLegs}/{totalLegs} legs completed
          </Text>
        </View>
      </LinearGradient>

      <ConnectivityBanner />

      {/* Shift banner - compact */}
      <TouchableOpacity
        style={[st.shiftBanner, { backgroundColor: isClocked ? "#E8F5E9" : "#FFF8E1" }]}
        onPress={async () => {
          if (isClocked) await clockOut();
          else if (activeProfile) await clockIn(activeProfile.id);
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name={isClocked ? "timer" : "timer-off"} size={18} color={isClocked ? GREEN : ORANGE} />
        <Text style={st.shiftText}>
          {isClocked ? `On Shift · ${formatDuration(elapsedMs)}` : "Off Shift · Tap to clock in"}
        </Text>
        <View style={[st.shiftBtn, { backgroundColor: isClocked ? RED : GREEN }]}>
          <Text style={st.shiftBtnText}>{isClocked ? "Out" : "In"}</Text>
        </View>
      </TouchableOpacity>

      {/* Next stop highlight */}
      {nextLeg && (
        <TouchableOpacity
          style={st.nextStopCard}
          onPress={() => { recordActivity(); router.push({ pathname: "/leg/[legId]", params: { legId: nextLeg.name, runSheetId: currentJobId || "" } } as any); }}
          activeOpacity={0.8}
        >
          <View style={st.nextStopHeader}>
            <MaterialIcons name="navigation" size={20} color={BLUE} />
            <Text style={st.nextStopLabel}>NEXT STOP</Text>
          </View>
          <Text style={st.nextStopTitle} numberOfLines={1}>
            {nextLeg.facility_from || "Pick-up"} → {nextLeg.facility_to || "Drop-off"}
          </Text>
          <View style={st.nextStopAction}>
            <Text style={st.nextStopActionText}>Tap to complete this leg</Text>
            <MaterialIcons name="arrow-forward" size={18} color={BLUE} />
          </View>
        </TouchableOpacity>
      )}

      {/* All completed state */}
      {!nextLeg && totalLegs > 0 && (
        <View style={st.allDoneCard}>
          <MaterialIcons name="check-circle" size={40} color={GREEN} />
          <Text style={st.allDoneTitle}>All Legs Completed!</Text>
          <Text style={st.allDoneSub}>Great job. All {totalLegs} stops have been finalized.</Text>
        </View>
      )}

      {/* Legs list */}
      <FlatList
        data={bundle?.legs || []}
        keyExtractor={(item) => item.name}
        renderItem={renderLegItem}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} tintColor={BLUE} />
        }
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: "#FFFFFF" }}
      />
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
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  liveIndicatorText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  progressSection: {
    marginTop: 14,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    minWidth: 4,
  },
  progressLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 6,
    fontWeight: "600",
  },

  // Shift banner
  shiftBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  shiftText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: FG,
  },
  shiftBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  shiftBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

  // Next stop card
  nextStopCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F0F7FF",
    borderWidth: 1.5,
    borderColor: BLUE,
  },
  nextStopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  nextStopLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: BLUE,
    letterSpacing: 0.5,
  },
  nextStopTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: FG,
    marginBottom: 8,
  },
  nextStopAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nextStopActionText: {
    fontSize: 14,
    color: BLUE,
    fontWeight: "600",
  },

  // All done
  allDoneCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 24,
    borderRadius: 14,
    backgroundColor: "#F0FFF4",
    borderWidth: 1.5,
    borderColor: GREEN,
    alignItems: "center",
    gap: 8,
  },
  allDoneTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: FG,
  },
  allDoneSub: {
    fontSize: 14,
    color: GRAY,
    textAlign: "center",
  },

  // Leg cards
  legCard: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 1 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
  },
  legCardNext: {
    borderWidth: 1.5,
    borderColor: BLUE,
    backgroundColor: "#FAFCFF",
  },
  legCardComplete: {
    opacity: 0.7,
  },
  legRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legStatusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  legNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  legInfo: {
    flex: 1,
  },
  legTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: FG,
  },
  legTitleComplete: {
    textDecorationLine: "line-through",
    color: GRAY,
  },
  legMeta: {
    marginTop: 3,
  },
  legMetaComplete: {
    fontSize: 12,
    fontWeight: "600",
    color: GREEN,
  },
  legMetaPartial: {
    fontSize: 12,
    fontWeight: "600",
    color: ORANGE,
  },
  legMetaNext: {
    fontSize: 12,
    fontWeight: "700",
    color: BLUE,
  },
  legMetaPending: {
    fontSize: 12,
    fontWeight: "500",
    color: GRAY,
  },
  legAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  legActionNext: {
    backgroundColor: BLUE,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 20,
    fontWeight: "700",
    color: FG,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: GRAY,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: BLUE,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    color: GRAY,
    marginTop: 12,
  },
});
