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
  Linking,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { useSync } from "@/lib/sync-context";
import { useLocationCapture, type GpsCoords } from "@/hooks/use-location";
import type { TransportLeg, PendingChange } from "@/lib/types";
import {
  getCachedBundle,
  applyLocalChange,
  addPendingChange,
} from "@/lib/offline-store";
import { useAuth } from "@/lib/auth-context";
import { useSessionTimeout } from "@/lib/session-timeout";
import { resolveCoordinates } from "@/lib/geocoding";
import { SignaturePreview } from "@/components/signature-preview";

const BLUE = "#3478C6";
const ORANGE = "#F27A2E";
const GREEN = "#34C759";
const RED = "#FF3B30";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const SURFACE = "#F5F5F7";
const FG = "#1A1A1A";

interface BarcodeRecord {
  data: string;
  barcodeType: string;
  timestamp: string;
}

export default function LegDetailScreen() {
  const { legId, runSheetId } = useLocalSearchParams<{ legId: string; runSheetId: string }>();
  const router = useRouter();
  const { refreshPendingCount } = useSync();
  const { captureLocation, isCapturing } = useLocationCapture();
  const { auth } = useAuth();
  const { recordActivity } = useSessionTimeout();

  const [leg, setLeg] = useState<TransportLeg | null>(null);
  // Destination coordinates resolved from addresses (for navigation)
  const [pickDestCoords, setPickDestCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dropDestCoords, setDropDestCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

          // Resolve destination coordinates from addresses for navigation
          const baseUrl = auth?.siteUrl || "";
          const headers = auth ? { Authorization: `token ${auth.apiKey}:${auth.apiSecret}` } : undefined;
          resolveCoordinates({
            gpsLat: found.pick_latitude,
            gpsLng: found.pick_longitude,
            addressName: found.pick_address,
            facilityName: found.facility_from,
            baseUrl,
            headers,
          }).then((coords) => {
            if (coords) setPickDestCoords({ latitude: coords.latitude, longitude: coords.longitude });
          }).catch(() => {});
          resolveCoordinates({
            gpsLat: found.drop_latitude,
            gpsLng: found.drop_longitude,
            addressName: found.drop_address,
            facilityName: found.facility_to,
            baseUrl,
            headers,
          }).then((coords) => {
            if (coords) setDropDestCoords({ latitude: coords.latitude, longitude: coords.longitude });
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.warn("Failed to load leg:", error);
    } finally {
      setIsLoading(false);
    }
  }, [runSheetId, legId, auth]);

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
      recordActivity();
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
    }, [legId, loadBarcodes, recordActivity])
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
    recordActivity();
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

  const openInMaps = (label: string, lat?: number, lng?: number) => {
    if (lat && lng) {
      // Open with coordinates for turn-by-turn navigation
      const url =
        Platform.OS === "ios"
          ? `maps:0,0?q=${encodeURIComponent(label)}@${lat},${lng}`
          : Platform.OS === "android"
          ? `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`
          : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
      });
    } else {
      // Open with address search for navigation
      const encoded = encodeURIComponent(label);
      const url =
        Platform.OS === "ios"
          ? `maps:0,0?q=${encoded}`
          : Platform.OS === "android"
          ? `geo:0,0?q=${encoded}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
      });
    }
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Leg Detail", headerBackTitle: "Back", headerStyle: { backgroundColor: BLUE }, headerTintColor: "#FFFFFF", headerTitleStyle: { color: "#FFFFFF" } }} />
        <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
          <View style={st.center}><ActivityIndicator size="large" color={BLUE} /></View>
        </ScreenContainer>
      </>
    );
  }

  if (!leg) {
    return (
      <>
        <Stack.Screen options={{ title: "Leg Detail", headerBackTitle: "Back", headerStyle: { backgroundColor: BLUE }, headerTintColor: "#FFFFFF", headerTitleStyle: { color: "#FFFFFF" } }} />
        <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
          <View style={st.center}><Text style={{ color: GRAY, fontSize: 15 }}>Leg not found</Text></View>
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: leg.name, headerBackTitle: "Back", headerStyle: { backgroundColor: BLUE }, headerTintColor: "#FFFFFF", headerTitleStyle: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" } }} />
      <ScreenContainer edges={["left", "right"]} containerClassName="bg-white">
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} style={{ backgroundColor: "#FFFFFF" }}>
          {/* Leg Header Card */}
          <View style={st.section}>
            <View style={st.card}>
              <View style={st.cardHeaderRow}>
                <Text style={st.cardTitle} numberOfLines={1}>{leg.name}</Text>
                <StatusBadge status={leg.status} />
              </View>

              <View style={st.routeViz}>
                <View style={st.routePoint}>
                  <MaterialIcons name="trip-origin" size={18} color={GREEN} />
                  <Text style={st.routeText} numberOfLines={2}>{leg.facility_from || "Pick-up location"}</Text>
                </View>
                <View style={st.routeLine} />
                <View style={st.routePoint}>
                  <MaterialIcons name="place" size={18} color={RED} />
                  <Text style={st.routeText} numberOfLines={2}>{leg.facility_to || "Drop-off location"}</Text>
                </View>
              </View>

              {leg.transport_job ? (
                <View style={st.jobRow}>
                  <MaterialIcons name="work" size={16} color={GRAY} />
                  <Text style={st.jobText}>Job: {leg.transport_job}</Text>
                </View>
              ) : null}

              {/* Navigate Buttons */}
              <View style={st.navBtnRow}>
                <TouchableOpacity
                  style={[st.navBtn, { backgroundColor: GREEN }]}
                  onPress={() => openInMaps(
                    leg.pick_address || leg.facility_from || "Pick-up",
                    pickDestCoords?.latitude,
                    pickDestCoords?.longitude
                  )}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="navigation" size={18} color="#fff" />
                  <Text style={st.navBtnText} numberOfLines={1}>Navigate to Pick-up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.navBtn, { backgroundColor: RED }]}
                  onPress={() => openInMaps(
                    leg.drop_address || leg.facility_to || "Drop-off",
                    dropDestCoords?.latitude,
                    dropDestCoords?.longitude
                  )}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="navigation" size={18} color="#fff" />
                  <Text style={st.navBtnText} numberOfLines={1}>Navigate to Drop-off</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* PICK-UP SECTION */}
          <SectionHeader title="Pick-up" icon="trip-origin" iconColor={GREEN} />
          <View style={st.section}>
            <View style={st.card}>
              <FieldLabel label="Timestamp" />
              <View style={st.timestampRow}>
                <View style={st.timestampDisplay}>
                  <MaterialIcons name="schedule" size={18} color={pickTimestamp ? GREEN : GRAY} />
                  <Text style={[st.timestampText, { color: pickTimestamp ? FG : GRAY }]}>{formatTimestamp(pickTimestamp)}</Text>
                </View>
                <TouchableOpacity style={[st.nowBtn, { backgroundColor: BLUE }]} onPress={() => recordTimestamp("pick")} activeOpacity={0.8} disabled={isCapturing}>
                  {isCapturing ? <ActivityIndicator size="small" color="#fff" /> : (
                    <><MaterialIcons name="access-time" size={18} color="#fff" /><Text style={st.nowBtnText}>Now</Text></>
                  )}
                </TouchableOpacity>
              </View>
              {pickGps ? (
                <View style={st.gpsRow}>
                  <MaterialIcons name="gps-fixed" size={14} color={GREEN} />
                  <Text style={[st.gpsText, { color: GREEN }]}>{formatGps(pickGps)}</Text>
                  {pickGps.accuracy != null ? <Text style={st.gpsAccuracy}>({Math.round(pickGps.accuracy)}m)</Text> : null}
                </View>
              ) : pickTimestamp ? (
                <View style={st.gpsRow}>
                  <MaterialIcons name="gps-off" size={14} color={GRAY} />
                  <Text style={[st.gpsText, { color: GRAY }]}>No GPS recorded</Text>
                </View>
              ) : null}

              <View style={st.fieldSpacer} />

              <FieldLabel label="Signature" />
              <TouchableOpacity style={[st.signatureBtn, pickSignature ? st.signatureBtnWithPreview : undefined]} onPress={() => captureSignature("pick")} activeOpacity={0.7}>
                {pickSignature ? (
                  <View style={st.signaturePreviewContainer}>
                    <SignaturePreview pathData={pickSignature} width={260} height={70} />
                    <View style={st.signatureRedoRow}>
                      <MaterialIcons name="check-circle" size={14} color={GREEN} />
                      <Text style={st.signatureRedoText}>Tap to redo</Text>
                    </View>
                  </View>
                ) : (
                  <View style={st.signatureEmpty}>
                    <MaterialIcons name="draw" size={28} color={GRAY} />
                    <Text style={[st.signatureText, { color: GRAY }]}>Tap to capture signature</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={st.fieldSpacer} />

              <FieldLabel label="Signed By" />
              <TextInput style={st.textInput} placeholder="Name of person signing" placeholderTextColor="#C7C7CC" value={pickSignedBy} onChangeText={setPickSignedBy} returnKeyType="done" />

              <View style={st.fieldSpacer} />

              <FieldLabel label="Notes / Comments" />
              <TextInput style={st.notesInput} placeholder="Add pick-up notes, instructions, or comments..." placeholderTextColor="#C7C7CC" value={pickNotes} onChangeText={setPickNotes} multiline numberOfLines={3} textAlignVertical="top" returnKeyType="default" />

              <View style={st.fieldSpacer} />

              <FieldLabel label="Photo" />
              <TouchableOpacity style={st.photoBtn} onPress={() => capturePhoto("pick")} activeOpacity={0.7}>
                {pickPhotoUri ? (
                  <Image source={{ uri: pickPhotoUri }} style={st.photoImage} contentFit="cover" />
                ) : (
                  <View style={st.photoEmpty}>
                    <MaterialIcons name="camera-alt" size={32} color={GRAY} />
                    <Text style={st.photoText}>Tap to take photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={st.fieldSpacer} />

              <FieldLabel label="Barcode / QR" />
              <TouchableOpacity style={st.barcodeBtn} onPress={() => openBarcodeScanner("pick")} activeOpacity={0.7}>
                {pickBarcode ? (
                  <View style={st.barcodeRow}>
                    <MaterialIcons name="qr-code" size={20} color={GREEN} />
                    <Text style={[st.barcodeText, { color: GREEN }]} numberOfLines={1}>{pickBarcode.data}</Text>
                  </View>
                ) : (
                  <View style={st.barcodeRow}>
                    <MaterialIcons name="qr-code-scanner" size={20} color={GRAY} />
                    <Text style={[st.barcodeText, { color: GRAY }]}>Scan barcode</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* DROP-OFF SECTION */}
          <SectionHeader title="Drop-off" icon="place" iconColor={RED} />
          <View style={st.section}>
            <View style={st.card}>
              <FieldLabel label="Timestamp" />
              <View style={st.timestampRow}>
                <View style={st.timestampDisplay}>
                  <MaterialIcons name="schedule" size={18} color={dropTimestamp ? GREEN : GRAY} />
                  <Text style={[st.timestampText, { color: dropTimestamp ? FG : GRAY }]}>{formatTimestamp(dropTimestamp)}</Text>
                </View>
                <TouchableOpacity style={[st.nowBtn, { backgroundColor: BLUE }]} onPress={() => recordTimestamp("drop")} activeOpacity={0.8} disabled={isCapturing}>
                  {isCapturing ? <ActivityIndicator size="small" color="#fff" /> : (
                    <><MaterialIcons name="access-time" size={18} color="#fff" /><Text style={st.nowBtnText}>Now</Text></>
                  )}
                </TouchableOpacity>
              </View>
              {dropGps ? (
                <View style={st.gpsRow}>
                  <MaterialIcons name="gps-fixed" size={14} color={GREEN} />
                  <Text style={[st.gpsText, { color: GREEN }]}>{formatGps(dropGps)}</Text>
                  {dropGps.accuracy != null ? <Text style={st.gpsAccuracy}>({Math.round(dropGps.accuracy)}m)</Text> : null}
                </View>
              ) : dropTimestamp ? (
                <View style={st.gpsRow}>
                  <MaterialIcons name="gps-off" size={14} color={GRAY} />
                  <Text style={[st.gpsText, { color: GRAY }]}>No GPS recorded</Text>
                </View>
              ) : null}

              <View style={st.fieldSpacer} />

              <FieldLabel label="Signature" />
              <TouchableOpacity style={[st.signatureBtn, dropSignature ? st.signatureBtnWithPreview : undefined]} onPress={() => captureSignature("drop")} activeOpacity={0.7}>
                {dropSignature ? (
                  <View style={st.signaturePreviewContainer}>
                    <SignaturePreview pathData={dropSignature} width={260} height={70} />
                    <View style={st.signatureRedoRow}>
                      <MaterialIcons name="check-circle" size={14} color={GREEN} />
                      <Text style={st.signatureRedoText}>Tap to redo</Text>
                    </View>
                  </View>
                ) : (
                  <View style={st.signatureEmpty}>
                    <MaterialIcons name="draw" size={28} color={GRAY} />
                    <Text style={[st.signatureText, { color: GRAY }]}>Tap to capture signature</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={st.fieldSpacer} />

              <FieldLabel label="Signed By" />
              <TextInput style={st.textInput} placeholder="Name of person signing" placeholderTextColor="#C7C7CC" value={dropSignedBy} onChangeText={setDropSignedBy} returnKeyType="done" />

              <View style={st.fieldSpacer} />

              <FieldLabel label="Notes / Comments" />
              <TextInput style={st.notesInput} placeholder="Add drop-off notes, instructions, or comments..." placeholderTextColor="#C7C7CC" value={dropNotes} onChangeText={setDropNotes} multiline numberOfLines={3} textAlignVertical="top" returnKeyType="default" />

              <View style={st.fieldSpacer} />

              <FieldLabel label="Photo" />
              <TouchableOpacity style={st.photoBtn} onPress={() => capturePhoto("drop")} activeOpacity={0.7}>
                {dropPhotoUri ? (
                  <Image source={{ uri: dropPhotoUri }} style={st.photoImage} contentFit="cover" />
                ) : (
                  <View style={st.photoEmpty}>
                    <MaterialIcons name="camera-alt" size={32} color={GRAY} />
                    <Text style={st.photoText}>Tap to take photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={st.fieldSpacer} />

              <FieldLabel label="Barcode / QR" />
              <TouchableOpacity style={st.barcodeBtn} onPress={() => openBarcodeScanner("drop")} activeOpacity={0.7}>
                {dropBarcode ? (
                  <View style={st.barcodeRow}>
                    <MaterialIcons name="qr-code" size={20} color={GREEN} />
                    <Text style={[st.barcodeText, { color: GREEN }]} numberOfLines={1}>{dropBarcode.data}</Text>
                  </View>
                ) : (
                  <View style={st.barcodeRow}>
                    <MaterialIcons name="qr-code-scanner" size={20} color={GRAY} />
                    <Text style={[st.barcodeText, { color: GRAY }]}>Scan barcode</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Floating Save Button */}
        <View style={st.saveBar}>
          <TouchableOpacity
            style={[st.saveBtn, { opacity: isSaving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={st.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={st.fieldLabel}>{label}</Text>;
}

function SectionHeader({ title, icon, iconColor }: { title: string; icon: string; iconColor: string }) {
  return (
    <View style={st.sectionHeader}>
      <MaterialIcons name={icon as any} size={20} color={iconColor} />
      <Text style={st.sectionHeaderText}>{title}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  card: {
    borderRadius: 12, padding: 20, backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: "800", flex: 1, marginRight: 12, color: FG },
  routeViz: { gap: 2 },
  routePoint: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeText: { fontSize: 15, fontWeight: "500", flex: 1, color: FG },
  routeLine: { marginLeft: 9, height: 16, borderLeftWidth: 2, borderLeftColor: BORDER },
  jobRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: BORDER },
  jobText: { fontSize: 13, fontWeight: "500", color: GRAY },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, marginBottom: 10, marginTop: 4 },
  sectionHeaderText: { fontSize: 17, fontWeight: "700", color: FG },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: GRAY, marginBottom: 8 },
  fieldSpacer: { height: 16 },
  timestampRow: { flexDirection: "row", gap: 10 },
  timestampDisplay: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: SURFACE },
  timestampText: { fontSize: 14, fontWeight: "500", flex: 1 },
  nowBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14 },
  nowBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  gpsText: { fontSize: 12, fontWeight: "500" },
  gpsAccuracy: { fontSize: 12, marginLeft: 2, color: GRAY },
  signatureBtn: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, height: 100, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE },
  signatureBtnWithPreview: { height: 110, paddingVertical: 8 },
  signaturePreviewContainer: { alignItems: "center", gap: 4 },
  signatureRedoRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  signatureRedoText: { fontSize: 11, color: GRAY },
  signatureEmpty: { alignItems: "center", gap: 6 },
  signatureText: { fontSize: 14, fontWeight: "600" },
  signatureTap: { fontSize: 12, color: GRAY },
  textInput: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, backgroundColor: SURFACE, color: FG },
  notesInput: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, minHeight: 80, backgroundColor: SURFACE, color: FG },
  photoBtn: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: "hidden", backgroundColor: SURFACE },
  photoImage: { width: "100%", height: 180 },
  photoEmpty: { height: 100, alignItems: "center", justifyContent: "center", gap: 6 },
  photoText: { fontSize: 14, fontWeight: "500", color: GRAY },
  barcodeBtn: { borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingVertical: 16, paddingHorizontal: 16, backgroundColor: SURFACE },
  barcodeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  barcodeText: { fontSize: 14, fontWeight: "600" },
  navBtnRow: { flexDirection: "row", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: BORDER },
  navBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  navBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  saveBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: "#FFFFFF", borderTopWidth: 0.5, borderTopColor: BORDER },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 16, backgroundColor: BLUE },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
