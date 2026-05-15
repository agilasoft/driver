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
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";

const HEADER_BLUE = "#3478C6";
const HEADER_BLUE_LIGHT = "#5B9BD5";
const FAB_ORANGE = "#F27A2E";

type Step = "connect" | "credentials";

export default function LoginScreen() {
  const { login, profiles } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    scannedSiteUrl?: string;
    scannedApiKey?: string;
    scannedApiSecret?: string;
  }>();

  const [step, setStep] = useState<Step>("connect");
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
      setStep("credentials");
    }
  }, [params.scannedSiteUrl, params.scannedApiKey, params.scannedApiSecret]);

  const handleNext = () => {
    if (!siteUrl.trim()) {
      Alert.alert("Missing Field", "Please enter your server URL.");
      return;
    }
    setStep("credentials");
  };

  const handleBack = () => {
    setStep("connect");
  };

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
      // Profile created — go back to profile picker so user can unlock it
      Alert.alert(
        "Host Added",
        "Profile created successfully. You can now select it from the host list.",
        [{ text: "OK", onPress: () => router.back() }]
      );
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
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          {/* Blue gradient header */}
          <LinearGradient
            colors={[HEADER_BLUE, HEADER_BLUE_LIGHT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={s.header}
          >
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={s.headerLogoBox}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 40, height: 40 }}
                contentFit="contain"
              />
            </View>
            <Text style={s.headerTitle}>
              {step === "connect" ? "Add Host" : "Sign In"}
            </Text>
            <Text style={s.headerSubtitle}>
              {step === "connect"
                ? "Connect to your Frappe server"
                : "Enter your API credentials"}
            </Text>
          </LinearGradient>

          {/* Step indicator */}
          <View style={s.stepContainer}>
            <View style={s.stepRow}>
              <View style={s.stepItem}>
                <View style={[s.stepDot, { backgroundColor: HEADER_BLUE }]}>
                  {step === "credentials" ? (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  ) : (
                    <Text style={s.stepDotText}>1</Text>
                  )}
                </View>
                <Text style={[s.stepLabel, { color: HEADER_BLUE }]}>Connect</Text>
              </View>
              <View style={[s.stepLine, { backgroundColor: step === "credentials" ? HEADER_BLUE : "#E5E5EA" }]} />
              <View style={s.stepItem}>
                <View style={[s.stepDot, { backgroundColor: step === "credentials" ? HEADER_BLUE : "#E5E5EA" }]}>
                  <Text style={[s.stepDotText, { color: step === "credentials" ? "#fff" : "#8E8E93" }]}>2</Text>
                </View>
                <Text style={[s.stepLabel, { color: step === "credentials" ? HEADER_BLUE : "#8E8E93" }]}>Sign In</Text>
              </View>
            </View>
          </View>

          {/* Form area */}
          <View style={s.formArea}>
            {step === "connect" ? (
              <>
                {/* Scan QR Card */}
                <TouchableOpacity
                  style={s.scanCard}
                  onPress={handleScanQR}
                  activeOpacity={0.7}
                >
                  <View style={s.scanIconBox}>
                    <MaterialIcons name="qr-code-scanner" size={28} color={HEADER_BLUE} />
                  </View>
                  <View style={s.scanTextArea}>
                    <Text style={s.scanTitle}>Scan QR Code</Text>
                    <Text style={s.scanDesc}>Quick setup with configuration QR</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#C7C7CC" />
                </TouchableOpacity>

                {/* Divider */}
                <View style={s.divider}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or enter manually</Text>
                  <View style={s.dividerLine} />
                </View>

                {/* Server URL */}
                <Text style={s.fieldLabel}>Server URL</Text>
                <View style={s.inputRow}>
                  <MaterialIcons name="dns" size={20} color="#8E8E93" style={{ marginRight: 10 }} />
                  <TextInput
                    style={s.input}
                    placeholder="erp.yourcompany.com"
                    placeholderTextColor="#C7C7CC"
                    value={siteUrl}
                    onChangeText={setSiteUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    onSubmitEditing={handleNext}
                  />
                </View>
                <Text style={s.fieldHint}>The URL of your Frappe or ERPNext instance</Text>

                {/* Continue button */}
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: HEADER_BLUE }]}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={s.primaryBtnText}>Continue</Text>
                  <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Server badge */}
                <TouchableOpacity
                  style={s.serverBadge}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="dns" size={16} color={HEADER_BLUE} />
                  <Text style={s.serverBadgeText} numberOfLines={1}>{siteUrl}</Text>
                  <MaterialIcons name="edit" size={14} color={HEADER_BLUE} />
                </TouchableOpacity>

                {/* API Key */}
                <Text style={s.fieldLabel}>API Key</Text>
                <View style={s.inputRow}>
                  <MaterialIcons name="vpn-key" size={20} color="#8E8E93" style={{ marginRight: 10 }} />
                  <TextInput
                    style={s.input}
                    placeholder="Your API key"
                    placeholderTextColor="#C7C7CC"
                    value={apiKey}
                    onChangeText={setApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>

                {/* API Secret */}
                <Text style={[s.fieldLabel, { marginTop: 16 }]}>API Secret</Text>
                <View style={s.inputRow}>
                  <MaterialIcons name="lock" size={20} color="#8E8E93" style={{ marginRight: 10 }} />
                  <TextInput
                    style={s.input}
                    placeholder="Your API secret"
                    placeholderTextColor="#C7C7CC"
                    value={apiSecret}
                    onChangeText={setApiSecret}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showSecret}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowSecret(!showSecret)} style={{ padding: 6 }}>
                    <MaterialIcons name={showSecret ? "visibility-off" : "visibility"} size={22} color="#8E8E93" />
                  </TouchableOpacity>
                </View>

                {/* Action buttons */}
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={s.backStepBtn}
                    onPress={handleBack}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="arrow-back" size={18} color="#8E8E93" />
                    <Text style={s.backStepText}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.primaryBtn, s.primaryBtnFlex, { backgroundColor: HEADER_BLUE, opacity: isLoading ? 0.7 : 1 }]}
                    onPress={handleLogin}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={s.primaryBtnText}>Sign In</Text>
                        <MaterialIcons name="login" size={18} color="#fff" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={s.hint}>
                  Generate API keys from User Settings in your ERPNext site.
                </Text>
              </>
            )}
          </View>

          {/* Branding */}
          <Text style={s.branding}>Powered by Agilasoft Cloud Technologies Inc.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  // Header
  header: {
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  headerLogoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  // Steps
  stepContainer: {
    paddingHorizontal: 48,
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stepItem: {
    alignItems: "center",
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 16,
    marginBottom: 18,
  },

  // Form
  formArea: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
  },
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  scanIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(52,120,198,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  scanTextArea: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  scanDesc: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 2,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: "#E5E5EA",
  },
  dividerText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8E8E93",
  },

  // Fields
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    backgroundColor: "#F5F5F7",
    paddingHorizontal: 14,
    height: 50,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A1A",
    paddingVertical: 0,
  },
  fieldHint: {
    fontSize: 12,
    color: "#8E8E93",
    marginTop: 6,
    marginLeft: 2,
  },

  // Server badge
  serverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(52,120,198,0.06)",
    borderWidth: 1,
    borderColor: "rgba(52,120,198,0.15)",
    marginBottom: 20,
  },
  serverBadgeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: HEADER_BLUE,
  },

  // Buttons
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 20,
  },
  primaryBtnFlex: {
    flex: 1,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  backStepBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  backStepText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#8E8E93",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  hint: {
    fontSize: 12,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },

  // Branding
  branding: {
    textAlign: "center",
    fontSize: 11,
    color: "#8E8E93",
    paddingVertical: 24,
  },
});
