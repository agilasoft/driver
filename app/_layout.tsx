import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SessionTimeoutProvider, useSessionTimeout } from "@/lib/session-timeout";
import { LiveLocationProvider } from "@/lib/live-location";
import { GeofenceProvider } from "@/lib/geofence";
import { ShiftLogProvider } from "@/lib/shift-log";
import { CurrentJobProvider } from "@/lib/current-job";
import {
  configureNotifications,
  requestNotificationPermissions,
  startAssignmentPolling,
  stopAssignmentPolling,
} from "@/lib/notifications";
import * as Notifications from "expo-notifications";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

// Configure notifications at module level (before any component renders)
configureNotifications();

/**
 * Auth guard that redirects unauthenticated users to profile-picker
 * and handles session timeout. Uses redirect approach instead of
 * conditional route mounting to prevent "Unmatched Route" errors.
 */
function useProtectedRoute() {
  const { auth, isLoading, activeProfile, signOut } = useAuth();
  const { isTimedOut, resetTimeout } = useSessionTimeout();
  const segments = useSegments();
  const router = useRouter();
  const isSigningOutRef = useRef(false);

  const isUnlocked = !!(auth?.isLoggedIn && activeProfile && !isTimedOut);

  // Determine if the user is on a public route
  const firstSegment = segments[0] as string | undefined;
  const secondSegment = segments[1] as string | undefined;
  const isPublicRoute = !firstSegment ||
    firstSegment === "profile-picker" ||
    firstSegment === "login" ||
    firstSegment === "config-scanner" ||
    firstSegment === "edit-profile" ||
    firstSegment === "index" ||
    firstSegment === "+not-found" ||
    (firstSegment === "oauth" && secondSegment === "callback");

  useEffect(() => {
    if (isLoading) return; // Wait for auth to load

    if (isTimedOut && auth?.isLoggedIn && activeProfile && !isSigningOutRef.current) {
      // Session timed out — sign out and redirect
      isSigningOutRef.current = true;
      signOut().then(() => {
        isSigningOutRef.current = false;
        router.replace("/profile-picker");
      });
      return;
    }

    if (!isUnlocked && !isPublicRoute) {
      // User is on a protected route but not authenticated — redirect
      router.replace("/profile-picker");
    }
  }, [isLoading, isUnlocked, isPublicRoute, isTimedOut, auth?.isLoggedIn, activeProfile]);

  return { isUnlocked, isLoading };
}

function AppNavigator() {
  const { auth } = useAuth();
  const router = useRouter();
  const { isLoading } = useProtectedRoute();

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

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* All routes are ALWAYS registered — auth is handled via redirect guard above */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="profile-picker" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="config-scanner" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="edit-profile" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="run-sheet/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="leg/[legId]" options={{ headerShown: true }} />
        <Stack.Screen name="signature-modal" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="barcode-scanner" options={{ presentation: "modal", headerShown: true }} />
        <Stack.Screen name="dev/theme-lab" options={{ headerShown: true }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
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
        <SessionTimeoutProvider>
        <SyncProvider>
          <LiveLocationProvider>
          <GeofenceProvider>
          <ShiftLogProvider>
          <CurrentJobProvider>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <AppNavigator />
            </QueryClientProvider>
          </trpc.Provider>
          </CurrentJobProvider>
          </ShiftLogProvider>
          </GeofenceProvider>
          </LiveLocationProvider>
        </SyncProvider>
        </SessionTimeoutProvider>
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
