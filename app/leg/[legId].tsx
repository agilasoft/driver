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
  StyleSheet,
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

interface BarcodeRecord {
  data: string;
  barcodeType: string;
  timestamp: string;
}

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
  const [pickBarcode, setPickBarcode] = useState<BarcodeRecord | null>(null);
  const [dropBarcode, setDropBarcode] = useState<BarcodeRecord | null>(null);
  const [pickNotes, setPickNotes] = useState("");
  const [dropNotes, setDropNotes] = useState("");

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
          setPickNotes(found.pick_notes || "");
          setDropNotes(found.drop_notes || "");
          if (found.pick_latitude && found.pick_longitude) {
            setPickGps({ latitude: found.pick_latitude, longitude: found.pick_longitude, accuracy: null });
          }
          if (found.drop_latitude && found.drop_longitude) {
            setDropGps({ latitude: found.drop_latitude, longitude: found.drop_longitude, accuracy: null });
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load leg:", error);
    } finally {
      setIsLoading(false);
    }
  }, [runSheetId, legId]);

  useEffect(() => { loadLeg(); }, [loadLeg]);

  const loadBarcodes = useCallback(async () => {
    if (!legId) return;
    try {
      const pickRaw = await AsyncStorage.getItem(`barcode_${legId}_pick`);
      if (pickRaw) setPickBarcode(JSON.parse(pickRaw));
      const dropRaw = await AsyncStorage.getItem(`barcode_${legId}_drop`);
      if (dropRaw) setDropBarcode(JSON.parse(dropRaw));
    } catch { /* ignore */ }
  }, [legId]);

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
        await loadBarcodes();
      })();
    }, [legId, loadBarcodes])
  );

  const recordTimestamp = async (type: "pick" | "drop") => {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    if (type === "pick") setPickTimestamp(now);
    else setDropTimestamp(now);
    const coords = await captureLocation();
    if (coords) {
      if (type === "pick") setPickGps(coords);
      else setDropGps(coords);
    }
  };

  const captureSignature = (type: "pick" | "drop") => {
    router.push({ pathname: "/signature-modal", params: { type, legId: legId!, runSheetId: runSheetId! } });
  };

  const openBarcodeScanner = (type: "pick" | "drop") => {
    router.push({ pathname: "/barcode-scanner", params: { type, legId: legId!, runSheetId: runSheetId! } });
  };

  const capturePhoto = async (type: "pick" | "drop") => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to take photos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        if (type === "pick") setPickPhotoUri(uri);
        else setDropPhotoUri(uri);
      }
    } catch {
      Alert.alert("Error", "Failed to capture photo.");
    }
  };

  const handleSave = async () => {
    if (!leg || !runSheetId) return;
    setIsSaving(true);
    try {
      const changes: Partial<TransportLeg> = {};
      if (pickSignedBy !== (leg.pick_signed_by || "")) changes.pick_signed_by = pickSignedBy;
      if (dropSignedBy !== (leg.drop_signed_by || "")) changes.drop_signed_by = dropSignedBy;
      if (pickSignature !== (leg.pick_signature || "")) changes.pick_signature = pickSignature;
      if (dropSignature !== (leg.drop_signature || "")) changes.drop_signature = dropSignature;
      if (pickTimestamp !== (leg.start_date || "")) changes.start_date = pickTimestamp;
      if (dropTimestamp !== (leg.end_date || "")) changes.end_date = dropTimestamp;
      if (pickNotes !== (leg.pick_notes || "")) changes.pick_notes = pickNotes;
      if (dropNotes !== (leg.drop_notes || "")) changes.drop_notes = dropNotes;
      if (dropTimestamp || dropSignature) {
        changes.date_signed = new Date().toISOString().replace("T", " ").slice(0, 19);
      }
      if (pickGps) { changes.pick_latitude = pickGps.latitude; changes.pick_longitude = pickGps.longitude; }
      if (dropGps) { changes.drop_latitude = dropGps.latitude; changes.drop_longitude = dropGps.longitude; }

      if (pickPhotoUri) {
        await addPendingChange({
          id: `${legId}_pick_photo_${Date.now()}`, legName: legId!, runSheetName: runSheetId,
          timestamp: new Date().toISOString(), changes: {}, photoUri: pickPhotoUri, photoType: "pick", synced: false,
        });
      }
      if (dropPhotoUri) {
        await addPendingChange({
          id: `${legId}_drop_photo_${Date.now()}`, legName: legId!, runSheetName: runSheetId,
          timestamp: new Date().toISOString(), changes: {}, photoUri: dropPhotoUri, photoType: "drop", synced: false,
        });
      }
      if (Object.keys(changes).length > 0) {
        await addPendingChange({
          id: `${legId}_fields_${Date.now()}`, legName: legId!, runSheetName: runSheetId,
          timestamp: new Date().toISOString(), changes, synced: false,
        });
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
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch { return ts; }
  };

  const formatGps = (coords: GpsCoords | null) => {
    if (!coords) return null;
    return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Leg Detail", headerBackTitle: "Back", headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.primary, headerTitleStyle: { color: colors.foreground } }} />
        <ScreenContainer edges={["left", "right"]}>
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        </ScreenContainer>
      </>
    );
  }

  if (!leg) {
    return (
      <>
        <Stack.Screen options={{ title: "Leg Detail", headerBackTitle: "Back", headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.primary, headerTitleStyle: { color: colors.foreground } }} />
        <ScreenContainer edges={["left", "right"]}>
          <View style={s.center}><Text style={{ color: colors.muted, fontSize: 15 }}>Leg not found</Text></View>
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: leg.name, headerBackTitle: "Back", headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.primary, headerTitleStyle: { color: colors.foreground, fontSize: 17, fontWeight: "600" } }} />
      <ScreenContainer edges={["left", "right"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Leg Header Card */}
          <View style={s.section}>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.cardHeaderRow}>
                <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{leg.name}</Text>
                <StatusBadge status={leg.status} />
              </View>

              {/* Route visualization */}
              <View style={s.routeViz}>
                <View style={s.routePoint}>
                  <MaterialIcons name="trip-origin" size={18} color={colors.success} />
                  <Text style={[s.routeText, { color: colors.foreground }]} numberOfLines={2}>
                    {leg.facility_from || "Pick-up location"}
                  </Text>
                </View>
                <View style={[s.routeLine, { borderLeftColor: colors.border }]} />
                <View style={s.routePoint}>
                  <MaterialIcons name="place" size={18} color={colors.error} />
                  <Text style={[s.routeText, { color: colors.foreground }]} numberOfLines={2}>
                    {leg.facility_to || "Drop-off location"}
                  </Text>
                </View>
              </View>

              {leg.transport_job ? (
                <View style={s.jobRow}>
                  <MaterialIcons name="work" size={16} color={colors.muted} />
                  <Text style={[s.jobText, { color: colors.muted }]}>Job: {leg.transport_job}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* PICK-UP SECTION */}
          <SectionHeader title="Pick-up" icon="trip-origin" iconColor={colors.success} colors={colors} />
          <View style={s.section}>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Timestamp */}
              <FieldLabel label="Timestamp" />
              <View style={s.timestampRow}>
                <View style={[s.timestampDisplay, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <MaterialIcons name="schedule" size={18} color={pickTimestamp ? colors.success : colors.muted} />
                  <Text style={[s.timestampText, { color: pickTimestamp ? colors.foreground : colors.muted }]}>
                    {formatTimestamp(pickTimestamp)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.nowBtn, { backgroundColor: colors.primary }]}
                  onPress={() => recordTimestamp("pick")}
                  activeOpacity={0.8}
                  disabled={isCapturing}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="access-time" size={18} color="#fff" />
                      <Text style={s.nowBtnText}>Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {pickGps ? (
                <View style={s.gpsRow}>
                  <MaterialIcons name="gps-fixed" size={14} color={colors.success} />
                  <Text style={[s.gpsText, { color: colors.success }]}>{formatGps(pickGps)}</Text>
                  {pickGps.accuracy != null ? (
                    <Text style={[s.gpsAccuracy, { color: colors.muted }]}>({Math.round(pickGps.accuracy)}m)</Text>
                  ) : null}
                </View>
              ) : pickTimestamp ? (
                <View style={s.gpsRow}>
                  <MaterialIcons name="gps-off" size={14} color={colors.muted} />
                  <Text style={[s.gpsText, { color: colors.muted }]}>No GPS recorded</Text>
                </View>
              ) : null}

              <View style={s.fieldSpacer} />

              {/* Signature */}
              <FieldLabel label="Signature" />
              <TouchableOpacity
                style={[s.signatureBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => captureSignature("pick")}
                activeOpacity={0.7}
              >
                {pickSignature ? (
                  <View style={s.signatureCaptured}>
                    <MaterialIcons name="check-circle" size={24} color={colors.success} />
                    <Text style={[s.signatureText, { color: colors.success }]}>Signature captured</Text>
                    <Text style={[s.signatureTap, { color: colors.muted }]}>Tap to redo</Text>
                  </View>
                ) : (
                  <View style={s.signatureEmpty}>
                    <MaterialIcons name="draw" size={28} color={colors.muted} />
                    <Text style={[s.signatureText, { color: colors.muted }]}>Tap to capture signature</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={s.fieldSpacer} />

              {/* Signed By */}
              <FieldLabel label="Signed By" />
              <TextInput
                style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Name of person signing"
                placeholderTextColor={colors.muted}
                value={pickSignedBy}
                onChangeText={setPickSignedBy}
                returnKeyType="done"
              />

              <View style={s.fieldSpacer} />

              {/* Delivery Notes */}
              <FieldLabel label="Notes / Comments" />
              <TextInput
                style={[s.notesInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Add pick-up notes, instructions, or comments..."
                placeholderTextColor={colors.muted}
                value={pickNotes}
                onChangeText={setPickNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                returnKeyType="default"
              />

              <View style={s.fieldSpacer} />

              {/* Photo */}
              <FieldLabel label="Photo" />
              <TouchableOpacity
                style={[s.photoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => capturePhoto("pick")}
                activeOpacity={0.7}
              >
                {pickPhotoUri ? (
                  <Image source={{ uri: pickPhotoUri }} style={s.photoImage} contentFit="cover" />
                ) : (
                  <View style={s.photoEmpty}>
                    <MaterialIcons name="camera-alt" size={32} color={colors.muted} />
                    <Text style={[s.photoText, { color: colors.muted }]}>Tap to take photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={s.fieldSpacer} />

              {/* Barcode */}
              <FieldLabel label="Barcode / QR" />
              <TouchableOpacity
                style={[s.barcodeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => openBarcodeScanner("pick")}
                activeOpacity={0.7}
              >
                {pickBarcode ? (
                  <View style={s.barcodeRow}>
                    <MaterialIcons name="qr-code" size={20} color={colors.success} />
                    <Text style={[s.barcodeText, { color: colors.success }]} numberOfLines={1}>{pickBarcode.data}</Text>
                  </View>
                ) : (
                  <View style={s.barcodeRow}>
                    <MaterialIcons name="qr-code-scanner" size={20} color={colors.muted} />
                    <Text style={[s.barcodeText, { color: colors.muted }]}>Scan barcode</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* DROP-OFF SECTION */}
          <SectionHeader title="Drop-off" icon="place" iconColor={colors.error} colors={colors} />
          <View style={s.section}>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Timestamp */}
              <FieldLabel label="Timestamp" />
              <View style={s.timestampRow}>
                <View style={[s.timestampDisplay, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <MaterialIcons name="schedule" size={18} color={dropTimestamp ? colors.success : colors.muted} />
                  <Text style={[s.timestampText, { color: dropTimestamp ? colors.foreground : colors.muted }]}>
                    {formatTimestamp(dropTimestamp)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.nowBtn, { backgroundColor: colors.primary }]}
                  onPress={() => recordTimestamp("drop")}
                  activeOpacity={0.8}
                  disabled={isCapturing}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="access-time" size={18} color="#fff" />
                      <Text style={s.nowBtnText}>Now</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {dropGps ? (
                <View style={s.gpsRow}>
                  <MaterialIcons name="gps-fixed" size={14} color={colors.success} />
                  <Text style={[s.gpsText, { color: colors.success }]}>{formatGps(dropGps)}</Text>
                  {dropGps.accuracy != null ? (
                    <Text style={[s.gpsAccuracy, { color: colors.muted }]}>({Math.round(dropGps.accuracy)}m)</Text>
                  ) : null}
                </View>
              ) : dropTimestamp ? (
                <View style={s.gpsRow}>
                  <MaterialIcons name="gps-off" size={14} color={colors.muted} />
                  <Text style={[s.gpsText, { color: colors.muted }]}>No GPS recorded</Text>
                </View>
              ) : null}

              <View style={s.fieldSpacer} />

              {/* Signature */}
              <FieldLabel label="Signature" />
              <TouchableOpacity
                style={[s.signatureBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => captureSignature("drop")}
                activeOpacity={0.7}
              >
                {dropSignature ? (
                  <View style={s.signatureCaptured}>
                    <MaterialIcons name="check-circle" size={24} color={colors.success} />
                    <Text style={[s.signatureText, { color: colors.success }]}>Signature captured</Text>
                    <Text style={[s.signatureTap, { color: colors.muted }]}>Tap to redo</Text>
                  </View>
                ) : (
                  <View style={s.signatureEmpty}>
                    <MaterialIcons name="draw" size={28} color={colors.muted} />
                    <Text style={[s.signatureText, { color: colors.muted }]}>Tap to capture signature</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={s.fieldSpacer} />

              {/* Signed By */}
              <FieldLabel label="Signed By" />
              <TextInput
                style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Name of person signing"
                placeholderTextColor={colors.muted}
                value={dropSignedBy}
                onChangeText={setDropSignedBy}
                returnKeyType="done"
              />

              <View style={s.fieldSpacer} />

              {/* Delivery Notes */}
              <FieldLabel label="Notes / Comments" />
              <TextInput
                style={[s.notesInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Add drop-off notes, instructions, or comments..."
                placeholderTextColor={colors.muted}
                value={dropNotes}
                onChangeText={setDropNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                returnKeyType="default"
              />

              <View style={s.fieldSpacer} />

              {/* Photo */}
              <FieldLabel label="Photo" />
              <TouchableOpacity
                style={[s.photoBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => capturePhoto("drop")}
                activeOpacity={0.7}
              >
                {dropPhotoUri ? (
                  <Image source={{ uri: dropPhotoUri }} style={s.photoImage} contentFit="cover" />
                ) : (
                  <View style={s.photoEmpty}>
                    <MaterialIcons name="camera-alt" size={32} color={colors.muted} />
                    <Text style={[s.photoText, { color: colors.muted }]}>Tap to take photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={s.fieldSpacer} />

              {/* Barcode */}
              <FieldLabel label="Barcode / QR" />
              <TouchableOpacity
                style={[s.barcodeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => openBarcodeScanner("drop")}
                activeOpacity={0.7}
              >
                {dropBarcode ? (
                  <View style={s.barcodeRow}>
                    <MaterialIcons name="qr-code" size={20} color={colors.success} />
                    <Text style={[s.barcodeText, { color: colors.success }]} numberOfLines={1}>{dropBarcode.data}</Text>
                  </View>
                ) : (
                  <View style={s.barcodeRow}>
                    <MaterialIcons name="qr-code-scanner" size={20} color={colors.muted} />
                    <Text style={[s.barcodeText, { color: colors.muted }]}>Scan barcode</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Floating Save Button */}
        <View style={[s.saveBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={s.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={s.fieldLabel}>{label}</Text>;
}

function SectionHeader({ title, icon, iconColor, colors }: { title: string; icon: string; iconColor: string; colors: any }) {
  return (
    <View style={s.sectionHeader}>
      <MaterialIcons name={icon as any} size={20} color={iconColor} />
      <Text style={[s.sectionHeaderText, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  card: { borderRadius: 20, padding: 20, borderWidth: 1 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: "800", flex: 1, marginRight: 12 },
  routeViz: { gap: 2 },
  routePoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeText: { fontSize: 15, fontWeight: "500", flex: 1 },
  routeLine: { marginLeft: 9, height: 16, borderLeftWidth: 2 },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.08)" },
  jobText: { fontSize: 13, fontWeight: "500" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  sectionHeaderText: { fontSize: 17, fontWeight: "700" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#687076", marginBottom: 8 },
  fieldSpacer: { height: 16 },
  timestampRow: { flexDirection: "row", gap: 10 },
  timestampDisplay: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14 },
  timestampText: { fontSize: 14, fontWeight: "500", flex: 1 },
  nowBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  nowBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  gpsText: { fontSize: 12, fontWeight: "500" },
  gpsAccuracy: { fontSize: 12, marginLeft: 2 },
  signatureBtn: { borderRadius: 14, borderWidth: 1, height: 100, alignItems: "center", justifyContent: "center" },
  signatureCaptured: { alignItems: "center", gap: 4 },
  signatureEmpty: { alignItems: "center", gap: 6 },
  signatureText: { fontSize: 14, fontWeight: "600" },
  signatureTap: { fontSize: 12 },
  textInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  notesInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 80 },
  photoBtn: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  photoImage: { width: "100%", height: 180 },
  photoEmpty: { height: 100, alignItems: "center", justifyContent: "center", gap: 6 },
  photoText: { fontSize: 14, fontWeight: "500" },
  barcodeBtn: { borderRadius: 14, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 16 },
  barcodeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  barcodeText: { fontSize: 14, fontWeight: "600" },
  saveBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 0.5 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
