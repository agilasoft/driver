import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import Svg, { Path, Line } from "react-native-svg";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
} from "react-native-reanimated";

const BLUE = "#3478C6";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const RED = "#FF3B30";
const FG = "#1A1A1A";

export default function SignatureModal() {
  const { type, legId, runSheetId } = useLocalSearchParams<{
    type: string;
    legId: string;
    runSheetId: string;
  }>();
  const router = useRouter();

  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [padSize, setPadSize] = useState({ width: 300, height: 220 });

  // Use shared values for gesture tracking
  const pathData = useSharedValue("");
  const allPaths = useSharedValue<string[]>([]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setPadSize({ width, height });
    }
  }, []);

  const addPathToState = useCallback((path: string) => {
    setPaths((prev) => [...prev, path]);
    setCurrentPath("");
  }, []);

  const updateCurrentPath = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  const panGesture = Gesture.Pan()
    .onStart((e) => {
      "worklet";
      const x = Math.max(0, Math.min(e.x, padSize.width));
      const y = Math.max(0, Math.min(e.y, padSize.height));
      pathData.value = `M${x.toFixed(1)},${y.toFixed(1)}`;
      runOnJS(updateCurrentPath)(pathData.value);
    })
    .onUpdate((e) => {
      "worklet";
      const x = Math.max(0, Math.min(e.x, padSize.width));
      const y = Math.max(0, Math.min(e.y, padSize.height));
      pathData.value = pathData.value + ` L${x.toFixed(1)},${y.toFixed(1)}`;
      runOnJS(updateCurrentPath)(pathData.value);
    })
    .onEnd(() => {
      "worklet";
      if (pathData.value.length > 0) {
        const finalPath = pathData.value;
        pathData.value = "";
        runOnJS(addPathToState)(finalPath);
      }
    })
    .minDistance(0)
    .shouldCancelWhenOutside(false);

  const handleClear = () => {
    setPaths([]);
    setCurrentPath("");
    pathData.value = "";
  };

  const handleDone = async () => {
    if (paths.length === 0) {
      router.back();
      return;
    }

    // Store signature data as SVG path string
    const signatureData = paths.join(" ");
    const key = `sig_${legId}_${type}`;
    await AsyncStorage.setItem(key, signatureData);

    // Also store a flag so the leg detail screen knows a signature was captured
    const flagKey = `sig_flag_${legId}_${type}`;
    await AsyncStorage.setItem(flagKey, "captured");

    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `${type === "pick" ? "Pick-up" : "Drop-off"} Signature`,
          presentation: "modal",
          headerStyle: { backgroundColor: "#FFFFFF" },
          headerTintColor: BLUE,
          headerTitleStyle: { color: FG, fontWeight: "600" },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              style={st.headerBtn}
            >
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDone}
              activeOpacity={0.7}
              style={st.headerBtn}
            >
              <Text style={st.doneText}>Done</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScreenContainer edges={["left", "right", "bottom"]} containerClassName="bg-white">
        <View style={st.container}>
          {/* Instructions */}
          <Text style={st.instructions}>
            Sign below using your finger
          </Text>

          {/* Signature Pad */}
          <View style={st.padWrapper}>
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={st.pad}
                onLayout={onLayout}
              >
                <Svg
                  width="100%"
                  height="100%"
                  style={StyleSheet.absoluteFill}
                >
                  {paths.map((d, i) => (
                    <Path
                      key={i}
                      d={d}
                      stroke="#1A1A2E"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPath ? (
                    <Path
                      d={currentPath}
                      stroke="#1A1A2E"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {/* Signature baseline */}
                  <Line
                    x1={32}
                    y1={padSize.height - 40}
                    x2={padSize.width - 32}
                    y2={padSize.height - 40}
                    stroke={BORDER}
                    strokeWidth={1}
                  />
                </Svg>

                {/* Signature label */}
                <View style={st.sigLabelContainer} pointerEvents="none">
                  <Text style={st.sigLabel}>Signature</Text>
                </View>

                {/* Empty state hint */}
                {paths.length === 0 && !currentPath ? (
                  <View style={st.emptyHint} pointerEvents="none">
                    <MaterialIcons name="draw" size={36} color={BORDER} />
                  </View>
                ) : null}
              </Animated.View>
            </GestureDetector>
          </View>

          {/* Clear Button */}
          <TouchableOpacity
            style={st.clearBtn}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color={RED} />
            <Text style={st.clearText}>Clear</Text>
          </TouchableOpacity>

          {/* Stroke count indicator */}
          {paths.length > 0 ? (
            <Text style={st.strokeCount}>
              {paths.length} stroke{paths.length !== 1 ? "s" : ""} drawn
            </Text>
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  instructions: {
    fontSize: 14,
    color: GRAY,
    textAlign: "center",
    marginBottom: 16,
  },
  padWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    maxHeight: 280,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: BORDER,
    overflow: "hidden",
    backgroundColor: "#FAFAFA",
  },
  pad: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sigLabelContainer: {
    position: "absolute",
    bottom: 12,
    left: 32,
  },
  sigLabel: {
    fontSize: 12,
    color: GRAY,
  },
  emptyHint: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelText: {
    fontSize: 16,
    color: BLUE,
  },
  doneText: {
    fontSize: 16,
    color: BLUE,
    fontWeight: "600",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  clearText: {
    fontSize: 14,
    color: RED,
    fontWeight: "500",
  },
  strokeCount: {
    fontSize: 12,
    color: GRAY,
    marginTop: 8,
  },
});
