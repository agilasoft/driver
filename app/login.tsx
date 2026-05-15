import React, { useState, useEffect, useRef } from "react";
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
  Animated,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useRouter, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Step = "connect" | "credentials";

export default function LoginScreen() {
  const { login, profiles } = useAuth();
  const colors = useColors();
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

  // Animation for step transitions
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (params.scannedSiteUrl && params.scannedApiKey && params.scannedApiSecret) {
      setSiteUrl(params.scannedSiteUrl);
      setApiKey(params.scannedApiKey);
      setApiSecret(params.scannedApiSecret);
      // Auto-advance to credentials step if all fields scanned
      setStep("credentials");
    }
  }, [params.scannedSiteUrl, params.scannedApiKey, params.scannedApiSecret]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: step === "connect" ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [step, slideAnim]);

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
    } catch (error: any) {
      Alert.alert("Login Failed", error.message || "Could not connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanQR = () => {
    router.push({ pathname: "/config-scanner", params: { source: "login" } });
  };

  const stepIndicator = (
    <View style={s.stepRow}>
      <View style={s.stepItem}>
        <View style={[s.stepCircle, { backgroundColor: colors.primary }]}>
          {step === "credentials" ? (
            <MaterialIcons name="check" size={16} color="#fff" />
          ) : (
            <Text style={s.stepNumber}>1</Text>
          )}
        </View>
        <Text style={[s.stepLabel, { color: step === "connect" ? colors.primary : colors.success }]}>
          Connect
        </Text>
      </View>
      <View style={[s.stepLine, { backgroundColor: step === "credentials" ? colors.primary : colors.border }]} />
      <View style={s.stepItem}>
        <View style={[
          s.stepCircle,
          { backgroundColor: step === "credentials" ? colors.primary : colors.border },
        ]}>
          <Text style={[s.stepNumber, { color: step === "credentials" ? "#fff" : colors.muted }]}>2</Text>
        </View>
        <Text style={[s.stepLabel, { color: step === "credentials" ? colors.primary : colors.muted }]}>
          Sign In
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Hero Header with Gradient */}
          <LinearGradient
            colors={["#0A3D7A", "#0F5FC6", "#3B82F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.heroHeader}
          >
            <View style={s.heroContent}>
              {/* Back to profiles */}
              {profiles.length > 0 ? (
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
              ) : <View style={{ height: 40 }} />}

              <View style={s.heroLogoRow}>
                <View style={s.heroLogoBox}>
                  <Image
                    source={require("@/assets/images/icon.png")}
                    style={{ width: 52, height: 52 }}
                    contentFit="contain"
                  />
                </View>
              </View>
              <Text style={s.heroTitle}>Driver</Text>
              <Text style={s.heroSubtitle}>CargoNext Logistics Platform</Text>
            </View>

            {/* Curved bottom edge */}
            <View style={s.heroCurve}>
              <View style={[s.heroCurveInner, { backgroundColor: colors.background }]} />
            </View>
          </LinearGradient>

          {/* Step Indicator */}
          <View style={[s.stepContainer, { backgroundColor: colors.background }]}>
            {stepIndicator}
          </View>

          {/* Form Card */}
          <View style={[s.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {step === "connect" ? (
              <>
                <Text style={[s.formTitle, { color: colors.foreground }]}>
                  Connect to Server
                </Text>
                <Text style={[s.formDesc, { color: colors.muted }]}>
                  Enter your Frappe/ERPNext server URL or scan a QR code to configure automatically.
                </Text>

                {/* Scan QR Button */}
                <TouchableOpacity
                  style={[s.scanQrBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08" }]}
                  onPress={handleScanQR}
                  activeOpacity={0.7}
                >
                  <View style={[s.scanQrIcon, { backgroundColor: colors.primary + "15" }]}>
                    <MaterialIcons name="qr-code-scanner" size={28} color={colors.primary} />
                  </View>
                  <View style={s.scanQrTextArea}>
                    <Text style={[s.scanQrTitle, { color: colors.primary }]}>Scan QR Code</Text>
                    <Text style={[s.scanQrDesc, { color: colors.muted }]}>
                      Quick setup with configuration QR
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
                </TouchableOpacity>

                {/* Divider */}
                <View style={s.orDivider}>
                  <View style={[s.orLine, { backgroundColor: colors.border }]} />
                  <Text style={[s.orText, { color: colors.muted }]}>or enter manually</Text>
                  <View style={[s.orLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Server URL Field */}
                <View style={s.fieldGroup}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>Server URL</Text>
                  <View style={[s.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MaterialIcons name="dns" size={20} color={colors.muted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={[s.input, { color: colors.foreground }]}
                      placeholder="erp.yourcompany.com"
                      placeholderTextColor={colors.muted}
                      value={siteUrl}
                      onChangeText={setSiteUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      returnKeyType="done"
                      onSubmitEditing={handleNext}
                    />
                  </View>
                  <Text style={[s.fieldHint, { color: colors.muted }]}>
                    The URL of your Frappe or ERPNext instance
                  </Text>
                </View>

                {/* Next Button */}
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={s.primaryBtnText}>Continue</Text>
                  <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Server badge */}
                <TouchableOpacity
                  style={[s.serverBadge, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}
                  onPress={handleBack}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="dns" size={16} color={colors.primary} />
                  <Text style={[s.serverBadgeText, { color: colors.primary }]} numberOfLines={1}>
                    {siteUrl}
                  </Text>
                  <MaterialIcons name="edit" size={14} color={colors.primary} />
                </TouchableOpacity>

                <Text style={[s.formTitle, { color: colors.foreground }]}>
                  Sign In
                </Text>
                <Text style={[s.formDesc, { color: colors.muted }]}>
                  Enter your API credentials to authenticate with the server.
                </Text>

                {/* API Key Field */}
                <View style={s.fieldGroup}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>API Key</Text>
                  <View style={[s.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MaterialIcons name="vpn-key" size={20} color={colors.muted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={[s.input, { color: colors.foreground }]}
                      placeholder="Your API key"
                      placeholderTextColor={colors.muted}
                      value={apiKey}
                      onChangeText={setApiKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                </View>

                {/* API Secret Field */}
                <View style={s.fieldGroup}>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>API Secret</Text>
                  <View style={[s.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <MaterialIcons name="lock" size={20} color={colors.muted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={[s.input, { color: colors.foreground }]}
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
                      onPress={() => setShowSecret(!showSecret)}
                      style={s.eyeBtn}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={showSecret ? "visibility-off" : "visibility"}
                        size={22}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Actions */}
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={[s.secondaryBtn, { borderColor: colors.border }]}
                    onPress={handleBack}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="arrow-back" size={18} color={colors.muted} />
                    <Text style={[s.secondaryBtnText, { color: colors.muted }]}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.primaryBtn, s.primaryBtnFlex, { backgroundColor: colors.primary, opacity: isLoading ? 0.7 : 1 }]}
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

                <Text style={[s.fieldHint, { color: colors.muted, textAlign: "center", marginTop: 8 }]}>
                  Generate API keys from User Settings in your ERPNext site.
                </Text>
              </>
            )}
          </View>

          {/* Branding */}
          <Text style={[s.branding, { color: colors.muted }]}>
            Powered by Agilasoft Cloud Technologies Inc.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  // Hero Header
  heroHeader: {
    paddingTop: 8,
    paddingBottom: 0,
    position: "relative",
    overflow: "hidden",
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroLogoRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  heroLogoBox: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    marginTop: 4,
  },
  heroCurve: {
    height: 24,
    overflow: "hidden",
  },
  heroCurveInner: {
    height: 48,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Step Indicator
  stepContainer: {
    paddingHorizontal: 48,
    paddingBottom: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stepItem: {
    alignItems: "center",
    gap: 6,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    color: "#fff",
    fontSize: 14,
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
    marginBottom: 20,
  },

  // Form Card
  formCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  formDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },

  // QR Scan
  scanQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 14,
  },
  scanQrIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  scanQrTextArea: {
    flex: 1,
  },
  scanQrTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  scanQrDesc: {
    fontSize: 13,
    marginTop: 2,
  },

  // Divider
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  orLine: {
    flex: 1,
    height: 0.5,
  },
  orText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Fields
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 2,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
    lineHeight: 17,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // Server badge
  serverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  serverBadgeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },

  // Buttons
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  primaryBtnFlex: {
    flex: 1,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },

  // Branding
  branding: {
    textAlign: "center",
    fontSize: 11,
    paddingVertical: 24,
  },
});
