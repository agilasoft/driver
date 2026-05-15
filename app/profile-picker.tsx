import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Alert,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import {
  type DriverProfile,
  verifyPin,
  checkBiometricAvailability,
  authenticateWithBiometric,
} from "@/lib/profile-manager";

export default function ProfilePickerScreen() {
  const router = useRouter();
  const colors = useColors();
  const { profiles, switchToProfile, loadProfiles, isLoading } = useAuth();
  const [unlockingProfile, setUnlockingProfile] = useState<DriverProfile | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleProfileTap = useCallback(
    async (profile: DriverProfile) => {
      // If profile has no security, switch directly
      if (!profile.pin && !profile.useBiometric) {
        setIsAuthenticating(true);
        try {
          await switchToProfile(profile);
          router.replace("/(tabs)");
        } catch (e: any) {
          Alert.alert("Error", e.message || "Failed to switch profile");
        } finally {
          setIsAuthenticating(false);
        }
        return;
      }

      // Try biometric first if enabled
      if (profile.useBiometric) {
        const bio = await checkBiometricAvailability();
        if (bio.available) {
          setIsAuthenticating(true);
          const success = await authenticateWithBiometric(
            `Unlock ${profile.fullName || profile.label}`
          );
          if (success) {
            try {
              await switchToProfile(profile);
              router.replace("/(tabs)");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to switch profile");
            } finally {
              setIsAuthenticating(false);
            }
            return;
          }
          setIsAuthenticating(false);
          // Biometric failed — fall through to PIN if available
          if (!profile.pin) {
            Alert.alert("Authentication Failed", "Biometric authentication failed. Please try again.");
            return;
          }
        }
      }

      // Show PIN entry
      if (profile.pin) {
        setUnlockingProfile(profile);
        setPinInput("");
        setPinError("");
      }
    },
    [switchToProfile, router]
  );

  const handlePinSubmit = useCallback(async () => {
    if (!unlockingProfile || !unlockingProfile.pin) return;
    if (verifyPin(pinInput, unlockingProfile.pin)) {
      setIsAuthenticating(true);
      try {
        await switchToProfile(unlockingProfile);
        setUnlockingProfile(null);
        setPinInput("");
        router.replace("/(tabs)");
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to switch profile");
      } finally {
        setIsAuthenticating(false);
      }
    } else {
      setPinError("Incorrect PIN. Please try again.");
      setPinInput("");
    }
  }, [unlockingProfile, pinInput, switchToProfile, router]);

  const handleAddProfile = useCallback(() => {
    router.push("/login");
  }, [router]);

  const renderProfile = useCallback(
    ({ item }: { item: DriverProfile }) => {
      const initials = (item.fullName || item.userName || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);

      const hostname = (() => {
        try {
          return new URL(item.siteUrl).hostname;
        } catch {
          return item.siteUrl;
        }
      })();

      const hasLock = !!item.pin || item.useBiometric;
      const lockLabel = item.useBiometric
        ? "Biometric"
        : item.pin
        ? "PIN"
        : "";

      return (
        <Pressable
          onPress={() => handleProfileTap(item)}
          style={({ pressed }) => [
            styles.profileCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View
            style={[styles.avatar, { backgroundColor: item.avatarColor }]}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text
              style={[styles.profileName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.fullName || item.userName}
            </Text>
            <Text
              style={[styles.profileServer, { color: colors.muted }]}
              numberOfLines={1}
            >
              {hostname}
            </Text>
            {item.driverName ? (
              <Text
                style={[styles.profileDriver, { color: colors.primary }]}
                numberOfLines={1}
              >
                {item.driverName}
              </Text>
            ) : null}
          </View>
          {hasLock ? (
            <View style={[styles.lockBadge, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[styles.lockText, { color: colors.primary }]}>
                {lockLabel}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, handleProfileTap]
  );

  // PIN entry overlay
  if (unlockingProfile) {
    return (
      <ScreenContainer
        edges={["top", "bottom", "left", "right"]}
        className="flex-1"
      >
        <View style={[styles.pinContainer, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.pinAvatar,
              { backgroundColor: unlockingProfile.avatarColor },
            ]}
          >
            <Text style={styles.pinAvatarText}>
              {(unlockingProfile.fullName || "?")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .substring(0, 2)}
            </Text>
          </View>
          <Text style={[styles.pinTitle, { color: colors.foreground }]}>
            {unlockingProfile.fullName || unlockingProfile.userName}
          </Text>
          <Text style={[styles.pinSubtitle, { color: colors.muted }]}>
            Enter your PIN to unlock
          </Text>

          <TextInput
            style={[
              styles.pinInput,
              {
                backgroundColor: colors.surface,
                borderColor: pinError ? colors.error : colors.border,
                color: colors.foreground,
              },
            ]}
            value={pinInput}
            onChangeText={(text) => {
              setPinInput(text.replace(/[^0-9]/g, ""));
              setPinError("");
            }}
            placeholder="Enter PIN"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handlePinSubmit}
          />

          {pinError ? (
            <Text style={[styles.pinErrorText, { color: colors.error }]}>
              {pinError}
            </Text>
          ) : null}

          <Pressable
            onPress={handlePinSubmit}
            style={({ pressed }) => [
              styles.pinButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isAuthenticating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pinButtonText}>Unlock</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setUnlockingProfile(null);
              setPinInput("");
              setPinError("");
            }}
            style={({ pressed }) => [
              styles.cancelButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.cancelText, { color: colors.muted }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer
        edges={["top", "bottom", "left", "right"]}
        className="flex-1"
      >
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      className="flex-1"
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Driver
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
            Select your profile to continue
          </Text>
        </View>

        {/* Profiles list */}
        {profiles.length > 0 ? (
          <FlatList
            data={profiles.sort(
              (a, b) =>
                new Date(b.lastUsedAt).getTime() -
                new Date(a.lastUsedAt).getTime()
            )}
            renderItem={renderProfile}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyIcon, { color: colors.muted }]}>👤</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Profiles Yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Add a profile to connect to your Frappe server
            </Text>
          </View>
        )}

        {/* Add Profile button */}
        <View style={styles.footer}>
          <Pressable
            onPress={handleAddProfile}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.addButtonText}>+ Add Profile</Text>
          </Pressable>
        </View>

        {/* Branding */}
        <Text style={[styles.branding, { color: colors.muted }]}>
          Powered by Agilasoft Cloud Technologies Inc.
        </Text>
      </View>

      {isAuthenticating ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Switching profile...</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  listContent: {
    paddingBottom: 16,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "600",
  },
  profileServer: {
    fontSize: 13,
    marginTop: 2,
  },
  profileDriver: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  lockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  lockText: {
    fontSize: 11,
    fontWeight: "600",
  },
  chevron: {
    fontSize: 24,
    fontWeight: "300",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  footer: {
    paddingVertical: 16,
  },
  addButton: {
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  branding: {
    textAlign: "center",
    fontSize: 11,
    paddingBottom: 16,
  },
  // PIN entry
  pinContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  pinAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pinAvatarText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
  },
  pinTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  pinSubtitle: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  pinInput: {
    width: "100%",
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 8,
    fontWeight: "600",
  },
  pinErrorText: {
    fontSize: 13,
    marginTop: 8,
  },
  pinButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  pinButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: {
    color: "#fff",
    fontSize: 15,
    marginTop: 12,
  },
});
