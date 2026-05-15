import { Redirect } from "expo-router";

/**
 * Root index route — always redirect to profile picker.
 * The profile picker is the true home screen (like CargoNext hosts list).
 * After unlocking a profile, the app navigates to /(tabs).
 */
export default function RootIndex() {
  return <Redirect href="/profile-picker" />;
}
