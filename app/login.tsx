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

  // Handle scanned QR config params
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
      Alert.alert(
        "Login Failed",
        error.message || "Could not connect to the server."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanQR = () => {
    router.push({
      pathname: "/config-scanner",
      params: { source: "login" },
    });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center px-8">
            {/* Logo */}
            <View className="items-center mb-8">
              <View className="w-20 h-20 rounded-2xl bg-primary items-center justify-center mb-4">
                <Image
                  source={require("@/assets/images/icon.png")}
                  style={{ width: 56, height: 56 }}
                  contentFit="contain"
                />
              </View>
              <Text className="text-3xl font-bold text-foreground">Driver</Text>
              <Text className="text-base text-muted mt-1">
                CargoNext Logistics
              </Text>
            </View>

            {/* Scan QR Button */}
            <TouchableOpacity
              style={[
                styles.scanQrBtn,
                { borderColor: colors.primary, backgroundColor: colors.surface },
              ]}
              onPress={handleScanQR}
              activeOpacity={0.7}
            >
              <MaterialIcons name="qr-code-scanner" size={22} color={colors.primary} />
              <Text style={[styles.scanQrText, { color: colors.primary }]}>
                Scan QR Code to Configure
              </Text>
            </TouchableOpacity>

            {/* Divider with "or" */}
            <View style={styles.orDivider}>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.orText, { color: colors.muted }]}>
                or enter manually
              </Text>
              <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Form */}
            <View className="gap-4">
              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">
                  Site URL
                </Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
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

              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">
                  API Key
                </Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  placeholder="Your API key"
                  placeholderTextColor={colors.muted}
                  value={apiKey}
                  onChangeText={setApiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              <View>
                <Text className="text-sm font-medium text-muted mb-1.5">
                  API Secret
                </Text>
                <TextInput
                  className="bg-surface border border-border rounded-xl px-4 py-3.5 text-foreground text-base"
                  placeholder="Your API secret"
                  placeholderTextColor={colors.muted}
                  value={apiSecret}
                  onChangeText={setApiSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                className="bg-primary rounded-xl py-4 items-center mt-2"
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-base font-semibold">
                    Sign In
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-muted text-center mt-6">
              Use your Frappe API key and secret to connect.{"\n"}
              Generate them from User Settings in your ERPNext site.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scanQrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 16,
  },
  scanQrText: {
    fontSize: 15,
    fontWeight: "600",
  },
  orDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  orLine: {
    flex: 1,
    height: 0.5,
  },
  orText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
