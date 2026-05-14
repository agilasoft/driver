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
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import type { RunSheetBundle, TransportLeg } from "@/lib/types";
import {
  getCachedBundle,
  refreshBundle,
  addPendingStatusChange,
  applyLocalStatusChange,
} from "@/lib/offline-store";
import { updateRunSheetStatus } from "@/lib/frappe-api";
import { generateRunSheetPdf } from "@/lib/pdf-generator";

export default function RunSheetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { isOnline, refreshPendingCount } = useSync();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (!id) return;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        if (isOnline) {
          try {
            const data = await refreshBundle(id);
            setBundle(data);
          } catch {
            const cached = await getCachedBundle(id);
            setBundle(cached);
          }
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
      });
    } catch {
      return dateStr;
    }
  };

  const openRouteMap = () => {
    if (!bundle) return;
    const legsJson = JSON.stringify(
      bundle.legs.map((l) => ({
        name: l.name,
        pickLat: l.pick_latitude || 0,
        pickLng: l.pick_longitude || 0,
        dropLat: l.drop_latitude || 0,
        dropLng: l.drop_longitude || 0,
        facilityFrom: l.facility_from || "Pick-up",
        facilityTo: l.facility_to || "Drop-off",
      }))
    );
    router.push({
      pathname: "/route-map",
      params: { legs: legsJson, title: id || "Route" },
    });
  };

  const handleExportPdf = async () => {
    if (!bundle) return;
    setIsGeneratingPdf(true);
    try {
      const fileUri = await generateRunSheetPdf(bundle);
      const fileName = fileUri.split("/").pop() || "RunSheet.pdf";
      Alert.alert("PDF Ready", `Choose an action for ${fileName}`, [
        {
          text: "Share",
          onPress: async () => {
            const Sharing = await import("expo-sharing");
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, {
                mimeType: "application/pdf",
                dialogTitle: `Share ${fileName}`,
              });
            } else {
              Alert.alert("Sharing not available on this device");
            }
          },
        },
        {
          text: "Print",
          onPress: async () => {
            const Print = await import("expo-print");
            await Print.printAsync({ uri: fileUri });
          },
        },
        { text: "Done", style: "cancel" },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to generate PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleStatusUpdate = (newStatus: string) => {
    if (!bundle) return;
    Alert.alert(
      "Update Status",
      `Change status to "${newStatus}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setIsUpdatingStatus(true);
            try {
              if (isOnline) {
                await updateRunSheetStatus(id!, newStatus);
                await loadData(true);
                Alert.alert("Success", `Status updated to ${newStatus}`);
              } else {
                const change = {
                  runSheetName: id!,
                  status: newStatus,
                  timestamp: new Date().toISOString(),
                };
                await addPendingStatusChange(change);
                await applyLocalStatusChange(id!, newStatus);
                await refreshPendingCount();
                const updatedBundle = await getCachedBundle(id!);
                if (updatedBundle) setBundle(updatedBundle);
                Alert.alert("Queued", "Status change will sync when online.");
              }
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to update status.");
            } finally {
              setIsUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const renderStatusActions = (currentStatus: string) => {
    const transitions: { label: string; status: string; icon: string; color: string }[] = [];

    if (currentStatus === "Dispatched" || currentStatus === "Draft") {
      transitions.push({
        label: "Start Trip",
        status: "In-Progress",
        icon: "play-arrow",
        color: colors.warning,
      });
    }
    if (currentStatus === "In-Progress") {
      transitions.push({
        label: "Complete",
        status: "Completed",
        icon: "check-circle",
        color: colors.success,
      });
      transitions.push({
        label: "Hold",
        status: "Hold",
        icon: "pause-circle-filled",
        color: colors.warning,
      });
    }
    if (currentStatus === "Hold") {
      transitions.push({
        label: "Resume",
        status: "In-Progress",
        icon: "play-arrow",
        color: colors.primary,
      });
    }

    if (transitions.length === 0) return null;

    return (
      <View style={styles.statusActionsRow}>
        {transitions.map((t) => (
          <TouchableOpacity
            key={t.status}
            style={[
              styles.statusBtn,
              {
                backgroundColor: t.color,
                opacity: isUpdatingStatus ? 0.6 : 1,
              },
            ]}
            onPress={() => handleStatusUpdate(t.status)}
            activeOpacity={0.8}
            disabled={isUpdatingStatus}
          >
            {isUpdatingStatus ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name={t.icon as any} size={18} color="#fff" />
                <Text style={styles.statusBtnText}>{t.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderLeg = ({ item, index }: { item: TransportLeg; index: number }) => {
    const hasPickData = !!item.pick_signature || !!item.start_date;
    const hasDropData = !!item.drop_signature || !!item.end_date;
    const isComplete = hasPickData && hasDropData;
    const isPartial = hasPickData || hasDropData;

    return (
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/leg/[legId]",
            params: {
              legId: item.name,
              runSheetId: id || "",
            },
          })
        }
        activeOpacity={0.7}
        style={[
          styles.legCard,
          {
            backgroundColor: colors.surface,
            borderColor: isComplete
              ? colors.success
              : isPartial
              ? colors.warning
              : colors.border,
            borderWidth: isComplete || isPartial ? 1.5 : 1,
          },
        ]}
      >
        {/* Leg number badge + status */}
        <View style={styles.legHeader}>
          <View
            style={[
              styles.legBadge,
              {
                backgroundColor: isComplete
                  ? colors.success
                  : isPartial
                  ? colors.warning
                  : colors.primary,
              },
            ]}
          >
            <Text style={styles.legBadgeText}>{index + 1}</Text>
          </View>
          <View style={styles.legHeaderText}>
            <Text
              style={[styles.legTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.facility_from || "Origin"} → {item.facility_to || "Destination"}
            </Text>
            <Text style={[styles.legSubtitle, { color: colors.muted }]}>
              {item.name}
            </Text>
          </View>
          <View style={styles.legStatusIcons}>
            {/* Pick status */}
            <View style={styles.legStatusIcon}>
              <MaterialIcons
                name="trip-origin"
                size={16}
                color={hasPickData ? colors.success : colors.border}
              />
            </View>
            {/* Drop status */}
            <View style={styles.legStatusIcon}>
              <MaterialIcons
                name="place"
                size={16}
                color={hasDropData ? colors.success : colors.border}
              />
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.border} />
        </View>

        {/* Info row */}
        <View style={styles.legInfoRow}>
          {item.start_date ? (
            <View style={[styles.legInfoChip, { backgroundColor: colors.background }]}>
              <MaterialIcons name="schedule" size={12} color={colors.success} />
              <Text style={[styles.legInfoText, { color: colors.muted }]}>
                Pick: {new Date(item.start_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          {item.end_date ? (
            <View style={[styles.legInfoChip, { backgroundColor: colors.background }]}>
              <MaterialIcons name="schedule" size={12} color={colors.error} />
              <Text style={[styles.legInfoText, { color: colors.muted }]}>
                Drop: {new Date(item.end_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          {item.pick_signature ? (
            <View style={[styles.legInfoChip, { backgroundColor: colors.background }]}>
              <MaterialIcons name="draw" size={12} color={colors.success} />
              <Text style={[styles.legInfoText, { color: colors.muted }]}>Signed</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (!bundle) return null;
    const doc = bundle.doc;
    return (
      <View style={styles.headerContainer}>
        {/* Run sheet info card */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.infoCardHeader}>
            <Text style={[styles.infoCardTitle, { color: colors.foreground }]}>
              {doc.name}
            </Text>
            <StatusBadge status={doc.status} />
          </View>

          {doc.route_name ? (
            <Text
              style={[styles.routeName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {doc.route_name}
            </Text>
          ) : null}

          <View style={styles.infoGrid}>
            <InfoRow icon="event" label="Date" value={formatDate(doc.run_date)} colors={colors} />
            <InfoRow icon="label" label="Type" value={doc.run_type} colors={colors} />
            <InfoRow icon="local-shipping" label="Vehicle" value={doc.vehicle || "—"} colors={colors} />
            <InfoRow icon="person" label="Driver" value={doc.driver_name || "—"} colors={colors} />
            {doc.dispatch_terminal ? (
              <InfoRow icon="warehouse" label="Dispatch" value={doc.dispatch_terminal} colors={colors} />
            ) : null}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={openRouteMap}
              activeOpacity={0.8}
            >
              <MaterialIcons name="map" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>Route Map</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: "#E67E22",
                  opacity: isGeneratingPdf ? 0.6 : 1,
                },
              ]}
              onPress={handleExportPdf}
              activeOpacity={0.8}
              disabled={isGeneratingPdf}
            >
              {isGeneratingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="picture-as-pdf" size={20} color="#fff" />
              )}
              <Text style={styles.actionBtnText}>
                {isGeneratingPdf ? "..." : "PDF"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Status Update Actions */}
          {renderStatusActions(doc.status)}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
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
          headerTitleStyle: { color: colors.foreground, fontSize: 17, fontWeight: "600" },
        }}
      />
      <ScreenContainer edges={["left", "right"]}>
        <ConnectivityBanner />

        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>Loading...</Text>
          </View>
        ) : !bundle ? (
          <View style={styles.centerContainer}>
            <MaterialIcons name="error-outline" size={48} color={colors.border} />
            <Text style={[styles.errorText, { color: colors.muted }]}>
              Could not load run sheet
            </Text>
          </View>
        ) : (
          <FlatList
            data={bundle.legs}
            keyExtractor={(item) => item.name}
            renderItem={renderLeg}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
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
    <View style={styles.infoRow2}>
      <MaterialIcons name={icon as any} size={18} color={colors.muted} />
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  infoCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoCardTitle: {
    fontSize: 20,
    fontWeight: "800",
    flex: 1,
    marginRight: 12,
  },
  routeName: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 14,
  },
  infoGrid: {
    gap: 8,
  },
  infoRow2: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    width: 64,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  statusActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  statusBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
  },
  statusBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  legCard: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  legHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  legBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  legHeaderText: {
    flex: 1,
  },
  legTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  legSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  legStatusIcons: {
    flexDirection: "row",
    gap: 4,
  },
  legStatusIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  legInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
    paddingLeft: 44,
  },
  legInfoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  legInfoText: {
    fontSize: 11,
    fontWeight: "500",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    fontSize: 15,
    marginTop: 16,
  },
});
