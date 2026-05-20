import { Redirect } from "expo-router";

/**
 * Catch-all for unmatched routes (e.g., deep link scheme URL on Android launch).
 * Simply redirects to the profile picker which is the app's true entry point.
 */
export default function NotFoundScreen() {
  return <Redirect href="/profile-picker" />;
}
