import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, ActivityIndicator, View } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { SyncProvider } from "@/lib/sync-context";
import {
  configureNotifications,
  requestNotificationPermissions,
  startAssignmentPolling,
  stopAssignmentPolling,
} from "@/lib/notifications";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "profile-picker",
};

// Configure notifications at module level (before any component renders)
configureNotifications();

function AppNavigator() {
  const { auth, isLoading, activeProfile } = useAuth();
  const router = useRouter();

  // Start/stop assignment polling based on auth state
  useEffect(() => {
    if (auth?.isLoggedIn && auth.driverId) {
      requestNotificationPermissions().then((granted) => {
        if (granted) {
          startAssignmentPolling();
        }
      });
    } else {
      stopAssignmentPolling();
    }
    return () => stopAssignmentPolling();
  }, [auth?.isLoggedIn, auth?.driverId]);

  // Handle notification taps — navigate to the run sheet
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.runSheetId && auth?.isLoggedIn) {
          router.push({
            pathname: "/run-sheet/[id]",
            params: { id: data.runSheetId as string },
          });
        }
      }
    );
    return () => subscription.remove();
  }, [auth?.isLoggedIn, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color="#3478C6" />
      </View>
    );
  }

  // Navigation flow:
  // 1. Profile picker is ALWAYS the home/landing screen (like CargoNext hosts list)
  // 2. When a profile is unlocked (PIN/biometric), activeProfile is set → show tabs
  // 3. Login screen is a modal pushed from profile picker to add new profiles
  const isUnlocked = auth?.isLoggedIn && activeProfile;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {isUnlocked ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="profile-picker"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="run-sheet/[id]"
              options={{ headerShown: true }}
            />
            <Stack.Screen
              name="leg/[legId]"
              options={{ headerShown: true }}
            />
            <Stack.Screen
              name="signature-modal"
              options={{
                presentation: "modal",
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="route-map"
              options={{ headerShown: true }}
            />
            <Stack.Screen
              name="barcode-scanner"
              options={{
                presentation: "modal",
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="config-scanner"
              options={{
                presentation: "modal",
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="login"
              options={{ presentation: "fullScreenModal" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="profile-picker"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="login"
              options={{ presentation: "fullScreenModal" }}
            />
            <Stack.Screen
              name="config-scanner"
              options={{
                presentation: "modal",
                headerShown: true,
              }}
            />
          </>
        )}
        <Stack.Screen name="oauth/callback" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SyncProvider>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <AppNavigator />
            </QueryClientProvider>
          </trpc.Provider>
        </SyncProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
