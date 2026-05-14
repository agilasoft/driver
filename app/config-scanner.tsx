import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Platform,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

// Conditionally import camera only on native
let CameraView: any = null;
let useCameraPermissions: any = null;

if (Platform.OS !== "web") {
  try {
    const cam = require("expo-camera");
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
  } catch {
    // Camera not available
  }
}

/**
 * Expected QR code JSON format:
 * {
 *   "siteUrl": "https://erp.example.com",
 *   "apiKey": "abc123...",
 *   "apiSecret": "xyz789..."
 * }
 *
 * Also supports URL format:
 * frappe://config?siteUrl=...&apiKey=...&apiSecret=...
 */
function parseConfigQR(data: string): {
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
} | null {
  // Try JSON format first
  try {
    const parsed = JSON.parse(data);
    if (parsed.siteUrl && parsed.apiKey && parsed.apiSecret) {
      return {
        siteUrl: String(parsed.siteUrl).trim(),
        apiKey: String(parsed.apiKey).trim(),
        apiSecret: String(parsed.apiSecret).trim(),
      };
    }
    // Also support alternate key names
    if (parsed.site_url && parsed.api_key && parsed.api_secret) {
      return {
        siteUrl: String(parsed.site_url).trim(),
        apiKey: String(parsed.api_key).trim(),
        apiSecret: String(parsed.api_secret).trim(),
      };
    }
    // Also support url/key/secret
    if (parsed.url && parsed.key && parsed.secret) {
      return {
        siteUrl: String(parsed.url).trim(),
        apiKey: String(parsed.key).trim(),
        apiSecret: String(parsed.secret).trim(),
      };
    }
  } catch {
    // Not JSON, try URL format
  }

  // Try URL format: frappe://config?siteUrl=...&apiKey=...&apiSecret=...
  try {
    // Handle custom scheme or https URLs with query params
    const url = new URL(data);
    const siteUrl = url.searchParams.get("siteUrl") || url.searchParams.get("site_url") || url.searchParams.get("url");
    const apiKey = url.searchParams.get("apiKey") || url.searchParams.get("api_key") || url.searchParams.get("key");
    const apiSecret = url.searchParams.get("apiSecret") || url.searchParams.get("api_secret") || url.searchParams.get("secret");
    if (siteUrl && apiKey && apiSecret) {
      return {
        siteUrl: siteUrl.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
      };
    }
  } catch {
    // Not a valid URL
  }

  // Try pipe-separated: siteUrl|apiKey|apiSecret
  const parts = data.split("|");
  if (parts.length === 3 && parts[0].includes("://")) {
    return {
      siteUrl: parts[0].trim(),
      apiKey: parts[1].trim(),
      apiSecret: parts[2].trim(),
    };
  }

  return null;
}

export default function ConfigScannerScreen() {
  const params = useLocalSearchParams<{ source: string }>();
  const router = useRouter();
  const colors = useColors();

  const [scanned, setScanned] = useState(false);
  const [scannedData, setScannedData] = useState("");
  const [parsedConfig, setParsedConfig] = useState<{
    siteUrl: string;
    apiKey: string;
    apiSecret: string;
  } | null>(null);
  const [manualEntry, setManualEntry] = useState("");

  const handleConfigParsed = useCallback(
    (config: { siteUrl: string; apiKey: string; apiSecret: string }) => {
      // Navigate back with the parsed config as params
      router.back();
      // Use a small delay to let the back navigation complete
      setTimeout(() => {
        router.setParams({
          scannedSiteUrl: config.siteUrl,
          scannedApiKey: config.apiKey,
          scannedApiSecret: config.apiSecret,
        });
      }, 100);
    },
    [router]
  );

  const handleConfirm = useCallback(() => {
    if (parsedConfig) {
      handleConfigParsed(parsedConfig);
    }
  }, [parsedConfig, handleConfigParsed]);

  const handleManualConfirm = useCallback(() => {
    const text = manualEntry.trim();
    if (!text) {
      Alert.alert("Required", "Please paste the configuration data.");
      return;
    }
    const config = parseConfigQR(text);
    if (!config) {
      Alert.alert(
        "Invalid Format",
        'Could not parse configuration. Expected JSON format:\n{"siteUrl": "...", "apiKey": "...", "apiSecret": "..."}'
      );
      return;
    }
    handleConfigParsed(config);
  }, [manualEntry, handleConfigParsed]);

  // Web fallback — manual paste
  if (Platform.OS === "web" || !CameraView) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Scan Server Config",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.foreground },
          }}
        />
        <ScreenContainer edges={["left", "right"]} className="px-4 pt-6">
          <ScrollView keyboardShouldPersistTaps="handled">
            <View className="items-center mb-6">
              <MaterialIcons
                name="qr-code-scanner"
                size={64}
                color={colors.border}
              />
              <Text className="text-base text-muted mt-3 text-center">
                Camera scanning is available on iOS and Android.{"\n"}
                Paste the configuration JSON below.
              </Text>
            </View>

            <View className="mb-4">
              <Text className="text-xs font-medium text-muted mb-1 ml-1">
                Configuration JSON
              </Text>
              <TextInput
                style={[
                  styles.manualInput,
                  {
                    borderColor: colors.border,
                    color: colors.foreground,
                    minHeight: 100,
                  },
                ]}
                placeholder='{"siteUrl": "...", "apiKey": "...", "apiSecret": "..."}'
                placeholderTextColor={colors.muted}
                value={manualEntry}
                onChangeText={setManualEntry}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleManualConfirm}
              activeOpacity={0.8}
            >
              <MaterialIcons name="check" size={20} color="#fff" />
              <Text style={styles.confirmBtnText}>Apply Configuration</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: colors.muted }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </ScreenContainer>
      </>
    );
  }

  // Native camera scanner
  return <NativeScanner />;

  function NativeScanner() {
    const [permission, requestPermission] = useCameraPermissions();

    const onBarcodeScanned = useCallback(
      ({ data }: { type: string; data: string }) => {
        if (scanned) return;

        const config = parseConfigQR(data);
        if (config) {
          setScanned(true);
          setScannedData(data);
          setParsedConfig(config);
        } else {
          // Show a brief error but keep scanning
          setScanned(true);
          setScannedData(data);
          setParsedConfig(null);
        }
      },
      [scanned]
    );

    if (!permission) {
      return (
        <ScreenContainer edges={["left", "right"]}>
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted">Loading camera...</Text>
          </View>
        </ScreenContainer>
      );
    }

    if (!permission.granted) {
      return (
        <>
          <Stack.Screen
            options={{
              title: "Scan Config QR",
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.foreground },
            }}
          />
          <ScreenContainer edges={["left", "right"]} className="px-6">
            <View className="flex-1 items-center justify-center gap-4">
              <MaterialIcons
                name="camera-alt"
                size={48}
                color={colors.muted}
              />
              <Text className="text-base text-muted text-center">
                Camera permission is required to scan QR codes
              </Text>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                onPress={requestPermission}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          </ScreenContainer>
        </>
      );
    }

    return (
      <>
        <Stack.Screen
          options={{
            title: "Scan Server Config",
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: "#000" },
            headerTintColor: "#fff",
            headerTitleStyle: { color: "#fff" },
          }}
        />
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          />

          {/* Scanning overlay */}
          {!scanned && (
            <View style={styles.overlay}>
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanFrame}>
                  <View
                    style={[
                      styles.corner,
                      styles.cornerTL,
                      { borderColor: colors.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      styles.cornerTR,
                      { borderColor: colors.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      styles.cornerBL,
                      { borderColor: colors.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      styles.cornerBR,
                      { borderColor: colors.primary },
                    ]}
                  />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.scanHint}>
                  Point camera at server configuration QR code
                </Text>
                <Text style={styles.scanSubHint}>
                  QR should contain JSON with siteUrl, apiKey, apiSecret
                </Text>
              </View>
            </View>
          )}

          {/* Scanned result */}
          {scanned && (
            <View
              style={[
                styles.resultOverlay,
                { backgroundColor: colors.surface },
              ]}
            >
              {parsedConfig ? (
                <>
                  <MaterialIcons
                    name="check-circle"
                    size={36}
                    color={colors.success}
                  />
                  <Text
                    style={[styles.resultLabel, { color: colors.foreground }]}
                  >
                    Server Configuration Found
                  </Text>

                  <View style={styles.configPreview}>
                    <View style={styles.configRow}>
                      <Text
                        style={[styles.configKey, { color: colors.muted }]}
                      >
                        Server
                      </Text>
                      <Text
                        style={[
                          styles.configValue,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {parsedConfig.siteUrl}
                      </Text>
                    </View>
                    <View style={styles.configRow}>
                      <Text
                        style={[styles.configKey, { color: colors.muted }]}
                      >
                        API Key
                      </Text>
                      <Text
                        style={[
                          styles.configValue,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {parsedConfig.apiKey.substring(0, 8)}...
                      </Text>
                    </View>
                    <View style={styles.configRow}>
                      <Text
                        style={[styles.configKey, { color: colors.muted }]}
                      >
                        API Secret
                      </Text>
                      <Text
                        style={[
                          styles.configValue,
                          { color: colors.foreground },
                        ]}
                      >
                        ****
                      </Text>
                    </View>
                  </View>

                  <View style={styles.resultActions}>
                    <TouchableOpacity
                      style={[
                        styles.confirmBtn,
                        { backgroundColor: colors.primary, flex: 1 },
                      ]}
                      onPress={handleConfirm}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="check" size={20} color="#fff" />
                      <Text style={styles.confirmBtnText}>
                        Apply Configuration
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.cancelBtn,
                        { borderColor: colors.border, flex: 1 },
                      ]}
                      onPress={() => {
                        setScanned(false);
                        setScannedData("");
                        setParsedConfig(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.cancelBtnText, { color: colors.muted }]}
                      >
                        Scan Again
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <MaterialIcons
                    name="error-outline"
                    size={36}
                    color={colors.error}
                  />
                  <Text
                    style={[styles.resultLabel, { color: colors.foreground }]}
                  >
                    Invalid QR Code
                  </Text>
                  <Text
                    style={[
                      styles.resultSubLabel,
                      { color: colors.muted },
                    ]}
                  >
                    QR code does not contain valid server configuration.
                    Expected JSON with siteUrl, apiKey, and apiSecret.
                  </Text>
                  <Text
                    style={[
                      styles.rawData,
                      { color: colors.muted, borderColor: colors.border },
                    ]}
                    numberOfLines={3}
                  >
                    {scannedData}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: colors.primary, width: "100%" },
                    ]}
                    onPress={() => {
                      setScanned(false);
                      setScannedData("");
                      setParsedConfig(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </>
    );
  }
}

const styles = StyleSheet.create({
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  overlayMiddle: {
    flexDirection: "row",
    height: 250,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    paddingTop: 24,
    gap: 6,
  },
  scanHint: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  scanSubHint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
  resultOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  resultSubLabel: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  rawData: {
    fontSize: 11,
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    width: "100%",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  configPreview: {
    width: "100%",
    gap: 8,
    marginVertical: 4,
  },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  configKey: {
    fontSize: 12,
    fontWeight: "600",
    width: 70,
  },
  configValue: {
    fontSize: 13,
    flex: 1,
  },
  resultActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
