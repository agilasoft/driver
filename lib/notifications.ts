import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchRunSheets, getStoredAuth } from "./frappe-api";

const KNOWN_SHEETS_KEY = "notification_known_sheets";
const POLL_INTERVAL = 60_000; // 60 seconds

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Configure the notification handler so notifications show in-app.
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Request notification permissions and set up the Android channel.
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("assignments", {
      name: "Run Sheet Assignments",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#1B3A5C",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Get the set of known run sheet names (already notified about).
 */
async function getKnownSheets(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KNOWN_SHEETS_KEY);
  if (!raw) return new Set();
  return new Set(JSON.parse(raw) as string[]);
}

/**
 * Save the set of known run sheet names.
 */
async function saveKnownSheets(names: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KNOWN_SHEETS_KEY, JSON.stringify([...names]));
}

/**
 * Check for new run sheet assignments and send local notifications.
 */
export async function checkForNewAssignments(): Promise<void> {
  try {
    const auth = await getStoredAuth();
    if (!auth?.isLoggedIn || !auth.driverId) return;

    const sheets = await fetchRunSheets();
    const known = await getKnownSheets();
    const newSheets = sheets.filter((s) => !known.has(s.name));

    for (const sheet of newSheets) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New Run Sheet Assigned",
          body: `${sheet.name}${sheet.route_name ? " — " + sheet.route_name : ""} on ${sheet.run_date || "TBD"}`,
          data: { runSheetId: sheet.name },
        },
        trigger: null, // Immediate
      });
      known.add(sheet.name);
    }

    // Also add existing sheets to known set on first run
    for (const sheet of sheets) {
      known.add(sheet.name);
    }

    await saveKnownSheets(known);
  } catch (error) {
    console.warn("Failed to check for new assignments:", error);
  }
}

/**
 * Start polling for new assignments in the background.
 */
export function startAssignmentPolling(): void {
  stopAssignmentPolling();
  // Do an initial check
  checkForNewAssignments();
  // Then poll periodically
  pollTimer = setInterval(checkForNewAssignments, POLL_INTERVAL);
}

/**
 * Stop polling for new assignments.
 */
export function stopAssignmentPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Clear the known sheets cache (e.g., on logout).
 */
export async function clearNotificationCache(): Promise<void> {
  await AsyncStorage.removeItem(KNOWN_SHEETS_KEY);
  stopAssignmentPolling();
}
