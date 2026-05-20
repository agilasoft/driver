import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export default function IndexRedirect() {
  const router = useRouter();
  const { isUnlocked } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isUnlocked) {
        router.replace("/(tabs)");
      } else {
        router.replace("/profile-picker");
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isUnlocked, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color="#3478C6" />
    </View>
  );
}
