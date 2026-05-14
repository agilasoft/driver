import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Platform,
  StyleSheet,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

export default function BarcodeScannerScreen() {
  const { legId, runSheetId, type } = useLocalSearchParams<{
    legId: string;
    runSheetId: string;
    type: string; // "pick" or "drop"
  }>();
  const router = useRouter();
  const colors = useColors();

  const [scanned, setScanned] = useState(false);
  const [scannedData, setScannedData] = useState("");
  const [scannedType, setScannedType] = useState("");
  const [manualEntry, setManualEntry] = useState("");

  // Web fallback — manual entry only
  if (Platform.OS === "web" || !CameraView) {
    return (
      <>
        <Stack.Screen
          options={{
            title: `Scan ${type === "pick" ? "Pick-up" : "Drop-off"} Barcode`,
            headerBackTitle: "Back",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.foreground },
          }}
        />
        <ScreenContainer edges={["left", "right"]} className="px-4 pt-6">
          <View className="items-center mb-6">
            <MaterialIcons name="qr-code-scanner" size={64} color={colors.border} />
            <Text className="text-base text-muted mt-3 text-center">
              Camera scanning is available on iOS and Android.{"\n"}
              Enter the barcode manually below.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-xs font-medium text-muted mb-1 ml-1">
              Barcode / Tracking Number
            </Text>
            <TextInput
              style={[
                styles.manualInput,
                { borderColor: colors.border, color: colors.foreground },
              ]}
              placeholder="Enter barcode or tracking number"
              placeholderTextColor={colors.muted}
              value={manualEntry}
              onChangeText={setManualEntry}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!manualEntry.trim()) {
                Alert.alert("Required", "Please enter a barcode or tracking number.");
                return;
              }
              saveScanResult(manualEntry.trim(), "manual");
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check" size={20} color="#fff" />
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.border }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
          </TouchableOpacity>
        </ScreenContainer>
      </>
    );
  }

  // Native camera scanner
  return <NativeScanner />;

  function NativeScanner() {
    const [permission, requestPermission] = useCameraPermissions();

    const onBarcodeScanned = useCallback(
      ({ type: barcodeType, data }: { type: string; data: string }) => {
        if (scanned) return;
        setScanned(true);
        setScannedData(data);
        setScannedType(barcodeType);
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
              title: "Scanner",
              headerBackTitle: "Back",
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.foreground },
            }}
          />
          <ScreenContainer edges={["left", "right"]} className="px-6">
            <View className="flex-1 items-center justify-center gap-4">
              <MaterialIcons name="camera-alt" size={48} color={colors.muted} />
              <Text className="text-base text-muted text-center">
                Camera permission is required to scan barcodes
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
            title: `Scan ${type === "pick" ? "Pick-up" : "Drop-off"} Barcode`,
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
              barcodeTypes: [
                "qr",
                "ean13",
                "ean8",
                "code128",
                "code39",
                "code93",
                "upc_a",
                "upc_e",
                "pdf417",
                "datamatrix",
              ],
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
                  <View style={[styles.corner, styles.cornerTL, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerTR, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerBL, { borderColor: colors.primary }]} />
                  <View style={[styles.corner, styles.cornerBR, { borderColor: colors.primary }]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.scanHint}>
                  Point camera at barcode or QR code
                </Text>
              </View>
            </View>
          )}

          {/* Scanned result */}
          {scanned && (
            <View style={[styles.resultOverlay, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="qr-code" size={32} color={colors.success} />
              <Text style={[styles.resultLabel, { color: colors.muted }]}>
                {scannedType.toUpperCase()}
              </Text>
              <Text
                style={[styles.resultData, { color: colors.foreground }]}
                numberOfLines={3}
              >
                {scannedData}
              </Text>

              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary, flex: 1 }]}
                  onPress={() => saveScanResult(scannedData, scannedType)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="check" size={20} color="#fff" />
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border, flex: 1 }]}
                  onPress={() => {
                    setScanned(false);
                    setScannedData("");
                    setScannedType("");
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.muted }]}>
                    Scan Again
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </>
    );
  }

  async function saveScanResult(data: string, barcodeType: string) {
    try {
      // Store the scan result keyed by leg + type
      const key = `barcode_${legId}_${type}`;
      const scanRecord = {
        data,
        barcodeType,
        timestamp: new Date().toISOString(),
        legId,
        runSheetId,
        type, // pick or drop
      };
      await AsyncStorage.setItem(key, JSON.stringify(scanRecord));

      Alert.alert(
        "Barcode Saved",
        `${type === "pick" ? "Pick-up" : "Drop-off"} barcode recorded:\n${data}`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert("Error", "Failed to save barcode data.");
    }
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
  },
  scanHint: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
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
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  resultData: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  resultActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
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
