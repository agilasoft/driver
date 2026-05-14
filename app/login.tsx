import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function LoginScreen() {
  const { login } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    scannedSiteUrl?: string;
    scannedApiKey?: string;
    scannedApiSecret?: string;
  }>();

  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (params.scannedSiteUrl && params.scannedApiKey && params.scannedApiSecret) {
      setSiteUrl(params.scannedSiteUrl);
      setApiKey(params.scannedApiKey);
      setApiSecret(params.scannedApiSecret);
    }
  }, [params.scannedSiteUrl, params.scannedApiKey, params.scannedApiSecret]);

  const handleLogin = async () => {
    if (!siteUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }
    let url = siteUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    setIsLoading(true);
    try {
      await login(url, apiKey.trim(), apiSecret.trim());
    } catch (error: any) {
      Alert.alert("Login Failed", error.message || "Could not connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanQR = () => {
    router.push({ pathname: "/config-scanner", params: { source: "login" } });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.container}>
            {/* Logo */}
            <View style={s.logoArea}>
              <View style={[s.logoBox, { backgroundColor: colors.primary }]}>
                <Image
                  source={require("@/assets/images/icon.png")}
                  style={{ width: 64, height: 64 }}
                  contentFit="contain"
                />
              </View>
              <Text style={[s.appTitle, { color: colors.foreground }]}>Driver</Text>
              <Text style={[s.appSubtitle, { color: colors.muted }]}>CargoNext Logistics</Text>
            </View>

            {/* Scan QR Button */}
            <TouchableOpacity
              style={[s.scanQrBtn, { borderColor: colors.primary, backgroundColor: colors.surface }]}
              onPress={handleScanQR}
              activeOpacity={0.7}
            >
              <MaterialIcons name="qr-code-scanner" size={24} color={colors.primary} />
              <Text style={[s.scanQrText, { color: colors.primary }]}>Scan QR Code to Configure</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={s.orDivider}>
              <View style={[s.orLine, { backgroundColor: colors.border }]} />
              <Text style={[s.orText, { color: colors.muted }]}>or enter manually</Text>
              <View style={[s.orLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Form */}
            <View style={s.formGroup}>
              <Text style={[s.label, { color: colors.muted }]}>Site URL</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="https://erp.yourcompany.com"
                placeholderTextColor={colors.muted}
                value={siteUrl}
                onChangeText={setSiteUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"
              />
            </View>

            <View style={s.formGroup}>
              <Text style={[s.label, { color: colors.muted }]}>API Key</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Your API key"
                placeholderTextColor={colors.muted}
                value={apiKey}
                onChangeText={setApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={s.formGroup}>
              <Text style={[s.label, { color: colors.muted }]}>API Secret</Text>
              <View style={s.secretRow}>
                <TextInput
                  style={[s.input, s.secretInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Your API secret"
                  placeholderTextColor={colors.muted}
                  value={apiSecret}
                  onChangeText={setApiSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showSecret}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  style={[s.eyeBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowSecret(!showSecret)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name={showSecret ? "visibility-off" : "visibility"} size={22} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[s.loginBtn, { backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="login" size={20} color="#fff" />
                  <Text style={s.loginBtnText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[s.hint, { color: colors.muted }]}>
              Use your Frappe API key and secret to connect.{"\n"}
              Generate them from User Settings in your ERPNext site.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logoArea: { alignItems: "center", marginBottom: 32 },
  logoBox: { width: 88, height: 88, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  appTitle: { fontSize: 32, fontWeight: "800" },
  appSubtitle: { fontSize: 16, fontWeight: "500", marginTop: 4 },
  scanQrBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    paddingVertical: 18, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", marginBottom: 20,
  },
  scanQrText: { fontSize: 16, fontWeight: "700" },
  orDivider: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  orLine: { flex: 1, height: 0.5 },
  orText: { fontSize: 13, fontWeight: "500" },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16 },
  secretRow: { flexDirection: "row", gap: 8 },
  secretInput: { flex: 1 },
  eyeBtn: { width: 52, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  loginBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 16, paddingVertical: 18, marginTop: 8,
  },
  loginBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  hint: { fontSize: 13, textAlign: "center", marginTop: 20, lineHeight: 20 },
});
