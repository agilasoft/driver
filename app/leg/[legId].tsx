import React, { useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useSync } from "@/lib/sync-context";
import { useLocationCapture, type GpsCoords } from "@/hooks/use-location";
import type { TransportLeg, PendingChange } from "@/lib/types";
import {
  getCachedBundle,
  applyLocalChange,
  addPendingChange,
} from "@/lib/offline-store";

export default function LegDetailScreen() {
  const { legId, runSheetId } = useLocalSearchParams<{
    legId: string;
    runSheetId: string;
  }>();
  const router = useRouter();
  const colors = useColors();
  const { refreshPendingCount } = useSync();
  const { captureLocation, isCapturing } = useLocationCapture();

  const [leg, setLeg] = useState<TransportLeg | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Local editable state
  const [pickSignedBy, setPickSignedBy] = useState("");
  const [dropSignedBy, setDropSignedBy] = useState("");
  const [pickSignature, setPickSignature] = useState("");
  const [dropSignature, setDropSignature] = useState("");
  const [pickTimestamp, setPickTimestamp] = useState("");
  const [dropTimestamp, setDropTimestamp] = useState("");
  const [pickPhotoUri, setPickPhotoUri] = useState("");
  const [dropPhotoUri, setDropPhotoUri] = useState("");
  const [pickGps, setPickGps] = useState<GpsCoords | null>(null);
  const [dropGps, setDropGps] = useState<GpsCoords | null>(null);

  const loadLeg = useCallback(async () => {
    if (!runSheetId || !legId) return;
    setIsLoading(true);
    try {
      const bundle = await getCachedBundle(runSheetId);
      if (bundle) {
        const found = bundle.legs.find((l) => l.name === legId);
        if (found) {
          setLeg(found);
          setPickSignedBy(found.pick_signed_by || "");
          setDropSignedBy(found.drop_signed_by || "");
          setPickSignature(found.pick_signature || "");
          setDropSignature(found.drop_signature || "");
          setPickTimestamp(found.start_date || "");
          setDropTimestamp(found.end_date || "");
          // Restore GPS if previously saved
          if (found.pick_latitude && found.pick_longitude) {
            setPickGps({
              latitude: found.pick_latitude,
              longitude: found.pick_longitude,
              accuracy: null,
            });
          }
          if (found.drop_latitude && found.drop_longitude) {
            setDropGps({
              latitude: found.drop_latitude,
              longitude: found.drop_longitude,
              accuracy: null,
            });
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load leg:", error);
    } finally {
      setIsLoading(false);
    }
  }, [runSheetId, legId]);

  useEffect(() => {
    loadLeg();
  }, [loadLeg]);

  // Reload signature flags when returning from signature modal
  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!legId) return;
        const pickFlag = await AsyncStorage.getItem(`sig_flag_${legId}_pick`);
        if (pickFlag === "captured") {
          const sigData = await AsyncStorage.getItem(`sig_${legId}_pick`);
          if (sigData) setPickSignature(sigData);
        }
        const dropFlag = await AsyncStorage.getItem(`sig_flag_${legId}_drop`);
        if (dropFlag === "captured") {
          const sigData = await AsyncStorage.getItem(`sig_${legId}_drop`);
          if (sigData) setDropSignature(sigData);
        }
      })();
    }, [legId])
  );

  const recordTimestamp = async (type: "pick" | "drop") => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (type === "pick") {
      setPickTimestamp(now);
    } else {
      setDropTimestamp(now);
    }

    // Capture GPS alongside the timestamp
    const coords = await captureLocation();
    if (coords) {
      if (type === "pick") {
        setPickGps(coords);
      } else {
        setDropGps(coords);
      }
    }
  };

  const captureSignature = (type: "pick" | "drop") => {
    router.push({
      pathname: "/signature-modal",
      params: { type, legId: legId!, runSheetId: runSheetId! },
    });
  };

  const capturePhoto = async (type: "pick" | "drop") => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Camera permission is needed to take photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (type === "pick") {
          setPickPhotoUri(uri);
        } else {
          setDropPhotoUri(uri);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to capture photo.");
    }
  };

  const handleSave = async () => {
    if (!leg || !runSheetId) return;
    setIsSaving(true);

    try {
      const changes: Partial<TransportLeg> = {};

      if (pickSignedBy !== (leg.pick_signed_by || "")) {
        changes.pick_signed_by = pickSignedBy;
      }
      if (dropSignedBy !== (leg.drop_signed_by || "")) {
        changes.drop_signed_by = dropSignedBy;
      }
      if (pickSignature !== (leg.pick_signature || "")) {
        changes.pick_signature = pickSignature;
      }
      if (dropSignature !== (leg.drop_signature || "")) {
        changes.drop_signature = dropSignature;
      }
      if (pickTimestamp !== (leg.start_date || "")) {
        changes.start_date = pickTimestamp;
      }
      if (dropTimestamp !== (leg.end_date || "")) {
        changes.end_date = dropTimestamp;
      }
      if (dropTimestamp || dropSignature) {
        changes.date_signed = new Date().toISOString().replace("T", " ").slice(0, 19);
      }

      // Include GPS coordinates
      if (pickGps) {
        changes.pick_latitude = pickGps.latitude;
        changes.pick_longitude = pickGps.longitude;
      }
      if (dropGps) {
        changes.drop_latitude = dropGps.latitude;
        changes.drop_longitude = dropGps.longitude;
      }

      // Save pick photo as pending change
      if (pickPhotoUri) {
        const pickPhotoChange: PendingChange = {
          id: `${legId}_pick_photo_${Date.now()}`,
          legName: legId!,
          runSheetName: runSheetId,
          timestamp: new Date().toISOString(),
          changes: {},
          photoUri: pickPhotoUri,
          photoType: "pick",
          synced: false,
        };
        await addPendingChange(pickPhotoChange);
      }

      // Save drop photo as pending change
      if (dropPhotoUri) {
        const dropPhotoChange: PendingChange = {
          id: `${legId}_drop_photo_${Date.now()}`,
          legName: legId!,
          runSheetName: runSheetId,
          timestamp: new Date().toISOString(),
          changes: {},
          photoUri: dropPhotoUri,
          photoType: "drop",
          synced: false,
        };
        await addPendingChange(dropPhotoChange);
      }

      // Save field changes as pending
      if (Object.keys(changes).length > 0) {
        const fieldChange: PendingChange = {
          id: `${legId}_fields_${Date.now()}`,
          legName: legId!,
          runSheetName: runSheetId,
          timestamp: new Date().toISOString(),
          changes,
          synced: false,
        };
        await addPendingChange(fieldChange);

        // Apply locally
        await applyLocalChange(runSheetId, legId!, changes);
      }

      await refreshPendingCount();
      Alert.alert("Saved", "Changes saved and queued for sync.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return "Not recorded";
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  const formatGps = (coords: GpsCoords | null) => {
    if (!coords) return null;
    return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Leg Detail",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.foreground },
          }}
        />
        <ScreenContainer edges={["left", "right"]}>
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </ScreenContainer>
      </>
    );
  }

  if (!leg) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Leg Detail",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.foreground },
          }}
        />
        <ScreenContainer edges={["left", "right"]}>
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted">Leg not found</Text>
          </View>
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: leg.name,
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
        }}
      />
      <ScreenContainer edges={["left", "right"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Leg Header */}
          <View className="mx-4 mt-4 mb-4">
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-lg font-bold text-foreground">{leg.name}</Text>
                <StatusBadge status={leg.status} />
              </View>

              <View className="flex-row items-center gap-2 mb-1">
                <MaterialIcons name="trip-origin" size={16} color={colors.success} />
                <Text className="text-sm text-foreground flex-1" numberOfLines={2}>
                  {leg.facility_from || "Pick-up location"}
                </Text>
              </View>
              <View className="ml-2 border-l border-border h-4" />
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="place" size={16} color={colors.error} />
                <Text className="text-sm text-foreground flex-1" numberOfLines={2}>
                  {leg.facility_to || "Drop-off location"}
                </Text>
              </View>

              {leg.transport_job ? (
                <View className="flex-row items-center gap-2 mt-3">
                  <MaterialIcons name="work" size={14} color={colors.muted} />
                  <Text className="text-xs text-muted">Job: {leg.transport_job}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* PICK SECTION */}
          <SectionHeader title="Pick-up" icon="trip-origin" iconColor={colors.success} />

          <View className="mx-4 mb-4">
            <View className="bg-surface rounded-2xl p-4 border border-border gap-4">
              {/* Timestamp + GPS */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Timestamp</Text>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 bg-background rounded-xl px-3 py-2.5 border border-border">
                    <Text className="text-sm text-foreground">
                      {formatTimestamp(pickTimestamp)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    className="bg-primary rounded-xl px-4 py-2.5"
                    onPress={() => recordTimestamp("pick")}
                    activeOpacity={0.8}
                    disabled={isCapturing}
                  >
                    {isCapturing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="text-white text-xs font-semibold">Now</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {pickGps ? (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons name="gps-fixed" size={12} color={colors.success} />
                    <Text className="text-xs text-success">{formatGps(pickGps)}</Text>
                    {pickGps.accuracy != null ? (
                      <Text className="text-xs text-muted ml-1">
                        ({Math.round(pickGps.accuracy)}m)
                      </Text>
                    ) : null}
                  </View>
                ) : pickTimestamp ? (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons name="gps-off" size={12} color={colors.muted} />
                    <Text className="text-xs text-muted">No GPS recorded</Text>
                  </View>
                ) : null}
              </View>

              {/* Signature */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Signature</Text>
                <TouchableOpacity
                  className="bg-background rounded-xl border border-border h-24 items-center justify-center"
                  onPress={() => captureSignature("pick")}
                  activeOpacity={0.8}
                >
                  {pickSignature ? (
                    <View className="flex-row items-center gap-2">
                      <MaterialIcons name="check-circle" size={20} color={colors.success} />
                      <Text className="text-sm text-success">Signature captured</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <MaterialIcons name="draw" size={20} color={colors.muted} />
                      <Text className="text-sm text-muted">Tap to capture signature</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Signed By */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Signed By</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm"
                  placeholder="Name of person signing"
                  placeholderTextColor={colors.muted}
                  value={pickSignedBy}
                  onChangeText={setPickSignedBy}
                  returnKeyType="done"
                />
              </View>

              {/* Photo */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Photo</Text>
                <TouchableOpacity
                  className="bg-background rounded-xl border border-border overflow-hidden"
                  onPress={() => capturePhoto("pick")}
                  activeOpacity={0.8}
                >
                  {pickPhotoUri ? (
                    <Image
                      source={{ uri: pickPhotoUri }}
                      style={{ width: "100%", height: 160 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-24 items-center justify-center">
                      <MaterialIcons name="camera-alt" size={24} color={colors.muted} />
                      <Text className="text-xs text-muted mt-1">Tap to take photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* DROP SECTION */}
          <SectionHeader title="Drop-off" icon="place" iconColor={colors.error} />

          <View className="mx-4 mb-4">
            <View className="bg-surface rounded-2xl p-4 border border-border gap-4">
              {/* Timestamp + GPS */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Timestamp</Text>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 bg-background rounded-xl px-3 py-2.5 border border-border">
                    <Text className="text-sm text-foreground">
                      {formatTimestamp(dropTimestamp)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    className="bg-primary rounded-xl px-4 py-2.5"
                    onPress={() => recordTimestamp("drop")}
                    activeOpacity={0.8}
                    disabled={isCapturing}
                  >
                    {isCapturing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="text-white text-xs font-semibold">Now</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {dropGps ? (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons name="gps-fixed" size={12} color={colors.success} />
                    <Text className="text-xs text-success">{formatGps(dropGps)}</Text>
                    {dropGps.accuracy != null ? (
                      <Text className="text-xs text-muted ml-1">
                        ({Math.round(dropGps.accuracy)}m)
                      </Text>
                    ) : null}
                  </View>
                ) : dropTimestamp ? (
                  <View className="flex-row items-center gap-1 mt-1.5">
                    <MaterialIcons name="gps-off" size={12} color={colors.muted} />
                    <Text className="text-xs text-muted">No GPS recorded</Text>
                  </View>
                ) : null}
              </View>

              {/* Signature */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Signature</Text>
                <TouchableOpacity
                  className="bg-background rounded-xl border border-border h-24 items-center justify-center"
                  onPress={() => captureSignature("drop")}
                  activeOpacity={0.8}
                >
                  {dropSignature ? (
                    <View className="flex-row items-center gap-2">
                      <MaterialIcons name="check-circle" size={20} color={colors.success} />
                      <Text className="text-sm text-success">Signature captured</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <MaterialIcons name="draw" size={20} color={colors.muted} />
                      <Text className="text-sm text-muted">Tap to capture signature</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Signed By */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Signed By</Text>
                <TextInput
                  className="bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm"
                  placeholder="Name of person signing"
                  placeholderTextColor={colors.muted}
                  value={dropSignedBy}
                  onChangeText={setDropSignedBy}
                  returnKeyType="done"
                />
              </View>

              {/* Photo */}
              <View>
                <Text className="text-xs font-medium text-muted mb-1">Photo</Text>
                <TouchableOpacity
                  className="bg-background rounded-xl border border-border overflow-hidden"
                  onPress={() => capturePhoto("drop")}
                  activeOpacity={0.8}
                >
                  {dropPhotoUri ? (
                    <Image
                      source={{ uri: dropPhotoUri }}
                      style={{ width: "100%", height: 160 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-24 items-center justify-center">
                      <MaterialIcons name="camera-alt" size={24} color={colors.muted} />
                      <Text className="text-xs text-muted mt-1">Tap to take photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Floating Save Button */}
        <View className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
          <TouchableOpacity
            className="bg-primary rounded-xl py-4 items-center"
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-semibold">Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </>
  );
}

function SectionHeader({
  title,
  icon,
  iconColor,
}: {
  title: string;
  icon: string;
  iconColor: string;
}) {
  return (
    <View className="flex-row items-center gap-2 mx-4 mb-2">
      <MaterialIcons name={icon as any} size={18} color={iconColor} />
      <Text className="text-base font-semibold text-foreground">{title}</Text>
    </View>
  );
}
