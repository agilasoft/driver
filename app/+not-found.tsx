import { Redirect } from "expo-router";

/**
 * Catch-all route for unmatched deep links.
 * When the app launches via its scheme (e.g., manus20260513075651:///),
 * Expo Router may not match the root index route in time.
 * This ensures any unmatched route redirects to the profile picker.
 */
export default function NotFoundScreen() {
  return <Redirect href="/profile-picker" />;
}
