import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { configureFrappeApi, testConnection, getLinkedDriver } from "@/lib/frappe-api";
import { addProfile } from "@/lib/profile-manager";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reloadProfiles } = useAuth();
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [testResult, setTestResult] = useState<{ userName: string; fullName: string; driverName: string; driverId: string } | null>(null);

  const handleTest = async () => {
    if (!siteUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const url = siteUrl.trim().replace(/\/+$/, "");
      configureFrappeApi(url, apiKey.trim(), apiSecret.trim());
      const { userName, fullName } = await testConnection();
      let driverName = "";
      let driverId = "";
      try {
        const linked = await getLinkedDriver(userName);
        driverName = linked.driverName || "";
        driverId = linked.driverId || "";
      } catch {
        // No linked driver is OK - user can still save profile
      }
      setTestResult({ userName, fullName, driverName, driverId });
      setStep(2);
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message || "Could not connect to server.");
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!testResult) return;
    setLoading(true);
    try {
      const profileData = {
        siteUrl: siteUrl.trim().replace(/\/+$/, ""),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        userName: testResult.userName,
        fullName: testResult.fullName,
        driverName: testResult.driverName || "",
        driverId: testResult.driverId || "",
      };
      await addProfile(profileData);
      if (reloadProfiles) {
        await reloadProfiles();
      }
      router.back();
    } catch (err: any) {
      const msg = err && typeof err === "object" && "message" in err ? err.message : String(err);
      Alert.alert("Error", msg || "Failed to save profile.");
    } finally { setLoading(false); }
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" />
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Add Profile</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={st.body}>
          {step === 1 ? (
            <>
              <Text style={st.label}>Server URL</Text>
              <TextInput style={st.input} value={siteUrl} onChangeText={setSiteUrl} placeholder="https://your-site.frappe.cloud" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <Text style={st.label}>API Key</Text>
              <TextInput style={st.input} value={apiKey} onChangeText={setApiKey} placeholder="API Key" autoCapitalize="none" autoCorrect={false} />
              <Text style={st.label}>API Secret</Text>
              <TextInput style={st.input} value={apiSecret} onChangeText={setApiSecret} placeholder="API Secret" secureTextEntry autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={st.btn} onPress={handleTest} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Test Connection</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={st.successCard}>
                <MaterialIcons name="check-circle" size={48} color="#34C759" />
                <Text style={st.successTitle}>Connected!</Text>
                <Text style={st.successText}>User: {testResult?.fullName}</Text>
                {testResult?.driverName ? <Text style={st.successText}>Driver: {testResult.driverName}</Text> : <Text style={st.warningText}>No linked Driver record found</Text>}
              </View>
              <TouchableOpacity style={st.btn} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Save Profile</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={st.secondaryBtn} onPress={() => setStep(1)}>
                <Text style={st.secondaryBtnText}>Back to Edit</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F7" },
  header: { backgroundColor: "#3478C6", paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff" },
  body: { padding: 24, gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#1A1A1A", marginTop: 8 },
  input: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, borderWidth: 1, borderColor: "#E5E5EA" },
  btn: { backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { paddingVertical: 12, alignItems: "center", marginTop: 12 },
  secondaryBtnText: { color: "#3478C6", fontSize: 14, fontWeight: "600" },
  successCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", gap: 8, marginVertical: 24 },
  successTitle: { fontSize: 22, fontWeight: "700", color: "#1A1A1A" },
  successText: { fontSize: 15, color: "#8E8E93" },
  warningText: { fontSize: 14, color: "#FF9500", marginTop: 4 },
});
