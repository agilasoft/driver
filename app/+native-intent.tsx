/**
 * Handle incoming native deep links.
 * When the app launches via its scheme (e.g., manus20260513075651:///),
 * the path may be empty or just "/". We redirect to "/" which maps to
 * the root index.tsx → profile-picker.
 *
 * This file is processed BEFORE the React tree mounts, so it can
 * rewrite arbitrary scheme URLs into valid app routes.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    // If the path is empty, just the scheme root, or just slashes, go to root
    if (!path || path === "/" || path === "" || path === "///") {
      return "/";
    }

    // Strip the scheme prefix if present (e.g., "manus20260513075651:///path" → "/path")
    // The path parameter may sometimes include the full URL on initial launch
    if (path.includes("://")) {
      const afterScheme = path.split("://")[1];
      // Remove leading slashes and host part
      const cleanPath = "/" + (afterScheme || "").replace(/^\/+/, "");
      // If it's just "/" after cleaning, go to root
      if (cleanPath === "/") return "/";
      return cleanPath;
    }

    return path;
  } catch {
    // Never crash in this function — redirect to root on error
    return "/";
  }
}
