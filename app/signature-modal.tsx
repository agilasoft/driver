import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  PanResponder,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import Svg, { Path } from "react-native-svg";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAD_WIDTH = SCREEN_WIDTH - 32;
const PAD_HEIGHT = 250;

export default function SignatureModal() {
  const { type, legId, runSheetId } = useLocalSearchParams<{
    type: string;
    legId: string;
    runSheetId: string;
  }>();
  const router = useRouter();
  const colors = useColors();

  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const pathRef = useRef<string>("");

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const x = Math.max(0, Math.min(locationX, PAD_WIDTH));
        const y = Math.max(0, Math.min(locationY, PAD_HEIGHT));
        pathRef.current = `M${x},${y}`;
        setCurrentPath(pathRef.current);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const x = Math.max(0, Math.min(locationX, PAD_WIDTH));
        const y = Math.max(0, Math.min(locationY, PAD_HEIGHT));
        pathRef.current += ` L${x},${y}`;
        setCurrentPath(pathRef.current);
      },
      onPanResponderRelease: () => {
        if (pathRef.current) {
          setPaths((prev) => [...prev, pathRef.current]);
          pathRef.current = "";
          setCurrentPath("");
        }
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    setCurrentPath("");
    pathRef.current = "";
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
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.foreground },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text className="text-primary text-base">Cancel</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleDone} activeOpacity={0.7}>
              <Text className="text-primary text-base font-semibold">Done</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScreenContainer edges={["left", "right", "bottom"]} className="px-4">
        <View className="flex-1 justify-center">
          {/* Instructions */}
          <Text className="text-sm text-muted text-center mb-4">
            Sign below using your finger
          </Text>

          {/* Signature Pad */}
          <View
            className="bg-white rounded-2xl border-2 border-border overflow-hidden"
            style={{ width: PAD_WIDTH, height: PAD_HEIGHT }}
            {...panResponder.panHandlers}
          >
            <Svg width={PAD_WIDTH} height={PAD_HEIGHT}>
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
            </Svg>

            {/* Signature line */}
            <View
              className="absolute bottom-10 left-8 right-8 border-b border-border"
              pointerEvents="none"
            />
            <Text
              className="absolute bottom-4 left-8 text-xs text-muted"
              style={{ pointerEvents: "none" } as any}
            >
              Signature
            </Text>
          </View>

          {/* Clear Button */}
          <TouchableOpacity
            className="flex-row items-center justify-center gap-2 mt-4 py-3"
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color={colors.error} />
            <Text className="text-error text-sm font-medium">Clear</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    </>
  );
}
