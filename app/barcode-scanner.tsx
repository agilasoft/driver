import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function BarcodeScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={st.title}>Scan Barcode</Text>
      </View>
      <View style={st.body}>
        <MaterialIcons name="qr-code-scanner" size={80} color="#C7C7CC" />
        <Text style={st.text}>Camera barcode scanning requires a native build.</Text>
        <Text style={st.subtext}>Use Expo Go on your device to test this feature.</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "600", color: "#fff" },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 32 },
  text: { fontSize: 16, color: "#fff", textAlign: "center" },
  subtext: { fontSize: 14, color: "#8E8E93", textAlign: "center" },
});
