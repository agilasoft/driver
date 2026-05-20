import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

export default function SignatureModal() {
  const router = useRouter();
  const { legId, type } = useLocalSearchParams<{ legId: string; type: string }>();
  const insets = useSafeAreaInsets();
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState("");

  const panGesture = Gesture.Pan()
    .runOnJS(true)
    .onStart((e) => { setCurrentPath(`M${e.x},${e.y}`); })
    .onUpdate((e) => { setCurrentPath((prev) => prev + ` L${e.x},${e.y}`); })
    .onEnd(() => { setPaths((prev) => [...prev, currentPath]); setCurrentPath(""); });

  const handleClear = () => { setPaths([]); setCurrentPath(""); };
  const handleSave = () => {
    // In a real app, we would capture the SVG as an image and save it
    Alert.alert("Signature Captured", "Signature saved for " + type + " on leg " + legId);
    router.back();
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <MaterialIcons name="close" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={st.title}>{type === "pick" ? "Pick-up" : "Drop-off"} Signature</Text>
        <TouchableOpacity onPress={handleClear}>
          <Text style={st.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={panGesture}>
        <View style={st.canvas}>
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((d, i) => <Path key={i} d={d} stroke="#1A1A1A" strokeWidth={3} fill="none" strokeLinecap="round" />)}
            {currentPath ? <Path d={currentPath} stroke="#1A1A1A" strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
          </Svg>
          {paths.length === 0 && !currentPath && (
            <Text style={st.placeholder}>Sign here</Text>
          )}
        </View>
      </GestureDetector>
      <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={st.saveBtn} onPress={handleSave}>
          <Text style={st.saveBtnText}>Save Signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#E5E5EA" },
  closeBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: "600", color: "#1A1A1A" },
  clearText: { fontSize: 15, color: "#FF3B30", fontWeight: "600" },
  canvas: { flex: 1, margin: 16, borderWidth: 1, borderColor: "#E5E5EA", borderRadius: 12, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  placeholder: { fontSize: 18, color: "#C7C7CC" },
  footer: { paddingHorizontal: 16, paddingTop: 12 },
  saveBtn: { backgroundColor: "#3478C6", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
