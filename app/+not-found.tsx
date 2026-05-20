import { Redirect } from "expo-router";

/**
 * Catch-all for unmatched routes.
 * This handles the Android deep link scheme launch (manus20260513075651:///)
 * which doesn't resolve to the root index on native.
 * 
 * Internal navigation to registered routes (leg/[legId], run-sheet/[id], etc.)
 * will NOT hit this handler as long as those routes are registered in the Stack.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
