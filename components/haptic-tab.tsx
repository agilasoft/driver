import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { PlatformPressable } from "@react-navigation/elements";
import * as Haptics from "expo-haptics";
import { useSessionTimeout } from "@/lib/session-timeout";

export function HapticTab(props: BottomTabBarButtonProps) {
  const { recordActivity } = useSessionTimeout();

  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // Record user activity for session timeout
        recordActivity();

        if (process.env.EXPO_OS === "ios") {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
