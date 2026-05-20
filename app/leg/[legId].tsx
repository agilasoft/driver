import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, StatusBar, Linking, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getCachedBundle, applyLocalChange, addPendingChange } from "@/lib/offline-store";
import { updateLegFields } from "@/lib/frappe-api";
import { useLocationCapture } from "@/hooks/use-location";
import { useSync } from "@/lib/sync-context";
import type { TransportLeg, RunSheetBundle } from "@/lib/types";

export default function LegDetailScreen() {
  const router = useRouter();
  const { legId } = useLocalSearchParams<{ legId: string }>();
  const insets = useSafeAreaInsets();
  const { captureLocation, isCapturing } = useLocationCapture();
  const { refreshPendingCount } = useSync();
  const [bundle, setBundle] = useState<RunSheetBundle | null>(null);
  const [leg, setLeg] = useState<TransportLeg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [pickSignedBy, setPickSignedBy] = useState("");
  const [dropSignedBy, setDropSignedBy] = useState("");
  const [pickNotes, setPickNotes] = useState("");
  const [dropNotes, setDropNotes] = useState("");
  const [pickLat, setPickLat] = useState<number | undefined>();
  const [pickLng, setPickLng] = useState<number | undefined>();
  const [dropLat, setDropLat] = useState<number | undefined>();
  const [dropLng, setDropLng] = useState<number | undefined>();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = useCallback(async () => {
    if (!legId) return;
    // Find the leg in cached bundles
    const keys = await (await import("@react-native-async-storage/async-storage")).default.getAllKeys();
    for (const key of keys) {
      if (!key.startsWith("offline_bundle_")) continue;
      const raw = await (await import("@react-native-async-storage/async-storage")).default.getItem(key);
      if (!raw) continue;
      const b: RunSheetBundle = JSON.parse(raw);
      const found = b.legs.find((l) => l.name === legId);
      if (found) { setBundle(b); setLeg(found); initFields(found); break; }
    }
  }, [legId]);

  const initFields = (l: TransportLeg) => {
    setPickSignedBy(l.pick_signed_by || "");
    setDropSignedBy(l.drop_signed_by || "");
    setPickNotes(l.pick_notes || "");
    setDropNotes(l.drop_notes || "");
    setPickLat(l.pick_latitude);
    setPickLng(l.pick_longitude);
    setDropLat(l.drop_latitude);
    setDropLng(l.drop_longitude);
    setStartDate(l.start_date || "");
    setEndDate(l.end_date || "");
  };

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  const handleCapturePickGps = useCallback(async () => {
    const coords = await captureLocation();
    if (coords) { setPickLat(coords.latitude); setPickLng(coords.longitude); }
  }, [captureLocation]);

  const handleCaptureDropGps = useCallback(async () => {
    const coords = await captureLocation();
    if (coords) { setDropLat(coords.latitude); setDropLng(coords.longitude); }
  }, [captureLocation]);

  const handleStampPickTime = () => setStartDate(new Date().toISOString());
  const handleStampDropTime = () => setEndDate(new Date().toISOString());

  const openNavigation = (lat?: number, lng?: number, address?: string) => {
    if (lat && lng) {
      const url = Platform.OS === "ios" ? `maps:?daddr=${lat},${lng}` : `google.navigation:q=${lat},${lng}`;
      Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
    } else if (address) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`);
    }
  };

  const handleSave = useCallback(async () => {
    if (!leg || !bundle) return;
    setSaving(true);
    const changes: Partial<TransportLeg> = {
      pick_signed_by: pickSignedBy,
      drop_signed_by: dropSignedBy,
      pick_notes: pickNotes,
      drop_notes: dropNotes,
      pick_latitude: pickLat,
      pick_longitude: pickLng,
      drop_latitude: dropLat,
      drop_longitude: dropLng,
      start_date: startDate,
      end_date: endDate,
    };
    try {
      await updateLegFields(leg.name, changes);
      await applyLocalChange(bundle.doc.name, leg.name, changes);
      Alert.alert("Saved", "Leg updated successfully.");
    } catch {
      await addPendingChange({
        id: `${leg.name}_${Date.now()}`,
        legName: leg.name,
        runSheetName: bundle.doc.name,
        timestamp: new Date().toISOString(),
        changes,
        synced: false,
      });
      await applyLocalChange(bundle.doc.name, leg.name, changes);
      await refreshPendingCount();
      Alert.alert("Saved Offline", "Changes will sync when online.");
    } finally { setSaving(false); }
  }, [leg, bundle, pickSignedBy, dropSignedBy, pickNotes, dropNotes, pickLat, pickLng, dropLat, dropLng, startDate, endDate, refreshPendingCount]);

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color="#3478C6" /></View>;
  if (!leg) return <View style={st.center}><Text>Leg not found</Text></View>;

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Leg {leg.idx}</Text>
          <Text style={st.headerSub}>{leg.facility_from || "—"} → {leg.facility_to || "—"}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={st.body}>
        {/* Route */}
        <View style={st.routeCard}>
          <View style={st.routeRow}>
            <View style={[st.routeDot, { backgroundColor: "#3478C6" }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.routeLabel}>Pick-up</Text>
              <Text style={st.routeAddr}>{leg.pick_address || leg.facility_from || "—"}</Text>
            </View>
            <TouchableOpacity style={st.navBtn} onPress={() => openNavigation(pickLat, pickLng, leg.pick_address || leg.facility_from)}>
              <MaterialIcons name="navigation" size={18} color="#3478C6" />
            </TouchableOpacity>
          </View>
          <View style={st.routeDivider} />
          <View style={st.routeRow}>
            <View style={[st.routeDot, { backgroundColor: "#F27A2E" }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.routeLabel}>Drop-off</Text>
              <Text style={st.routeAddr}>{leg.drop_address || leg.facility_to || "—"}</Text>
            </View>
            <TouchableOpacity style={st.navBtn} onPress={() => openNavigation(dropLat, dropLng, leg.drop_address || leg.facility_to)}>
              <MaterialIcons name="navigation" size={18} color="#F27A2E" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pick-up Section */}
        <Text style={st.sectionTitle}>Pick-up</Text>
        <View style={st.fieldCard}>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Timestamp</Text>
            <TouchableOpacity style={st.stampBtn} onPress={handleStampPickTime}>
              <Text style={st.stampBtnText}>{startDate ? new Date(startDate).toLocaleString() : "Stamp Now"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>GPS</Text>
            <TouchableOpacity style={st.gpsBtn} onPress={handleCapturePickGps} disabled={isCapturing}>
              <MaterialIcons name="my-location" size={16} color="#3478C6" />
              <Text style={st.gpsBtnText}>{pickLat ? `${pickLat.toFixed(5)}, ${pickLng?.toFixed(5)}` : "Capture"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Signed By</Text>
            <TextInput style={st.fieldInput} value={pickSignedBy} onChangeText={setPickSignedBy} placeholder="Name" returnKeyType="done" />
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Notes</Text>
            <TextInput style={[st.fieldInput, { height: 60 }]} value={pickNotes} onChangeText={setPickNotes} placeholder="Notes..." multiline returnKeyType="done" />
          </View>
          <TouchableOpacity style={st.sigBtn} onPress={() => router.push({ pathname: "/signature-modal", params: { legId: leg.name, type: "pick" } })}>
            <MaterialIcons name="draw" size={18} color="#3478C6" />
            <Text style={st.sigBtnText}>{leg.pick_signature ? "View Signature" : "Capture Signature"}</Text>
          </TouchableOpacity>
        </View>

        {/* Drop-off Section */}
        <Text style={st.sectionTitle}>Drop-off</Text>
        <View style={st.fieldCard}>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Timestamp</Text>
            <TouchableOpacity style={st.stampBtn} onPress={handleStampDropTime}>
              <Text style={st.stampBtnText}>{endDate ? new Date(endDate).toLocaleString() : "Stamp Now"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>GPS</Text>
            <TouchableOpacity style={st.gpsBtn} onPress={handleCaptureDropGps} disabled={isCapturing}>
              <MaterialIcons name="my-location" size={16} color="#F27A2E" />
              <Text style={st.gpsBtnText}>{dropLat ? `${dropLat.toFixed(5)}, ${dropLng?.toFixed(5)}` : "Capture"}</Text>
            </TouchableOpacity>
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Signed By</Text>
            <TextInput style={st.fieldInput} value={dropSignedBy} onChangeText={setDropSignedBy} placeholder="Name" returnKeyType="done" />
          </View>
          <View style={st.fieldRow}>
            <Text style={st.fieldLabel}>Notes</Text>
            <TextInput style={[st.fieldInput, { height: 60 }]} value={dropNotes} onChangeText={setDropNotes} placeholder="Notes..." multiline returnKeyType="done" />
          </View>
          <TouchableOpacity style={st.sigBtn} onPress={() => router.push({ pathname: "/signature-modal", params: { legId: leg.name, type: "drop" } })}>
            <MaterialIcons name="draw" size={18} color="#F27A2E" />
            <Text style={st.sigBtnText}>{leg.drop_signature ? "View Signature" : "Capture Signature"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[st.saveBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={st.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <><MaterialIcons name="save" size={20} color="#fff" /><Text style={st.saveBtnText}>Save Changes</Text></>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  body: { padding: 16, paddingBottom: 120 },
  routeCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeLabel: { fontSize: 12, color: "#8E8E93" },
  routeAddr: { fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  routeDivider: { width: 2, height: 20, backgroundColor: "#E5E5EA", marginLeft: 5, marginVertical: 4 },
  navBtn: { padding: 8, backgroundColor: "#E3F2FD", borderRadius: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", marginBottom: 8, marginTop: 8 },
  fieldCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, gap: 12 },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 13, color: "#8E8E93", width: 80 },
  fieldInput: { flex: 1, backgroundColor: "#F5F5F7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, textAlignVertical: "top" },
  stampBtn: { backgroundColor: "#E3F2FD", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  stampBtnText: { color: "#3478C6", fontSize: 13, fontWeight: "600" },
  gpsBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F5F5F7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  gpsBtnText: { color: "#3478C6", fontSize: 13, fontWeight: "500" },
  sigBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: "#F0F0F0", marginTop: 4 },
  sigBtnText: { color: "#3478C6", fontSize: 14, fontWeight: "600" },
  saveBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#E5E5EA" },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
