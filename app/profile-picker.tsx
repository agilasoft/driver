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
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const getInitials = (name: string) => {
    return (name || "?")
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const renderProfile = useCallback(
    ({ item }: { item: DriverProfile }) => {
      const initials = getInitials(item.fullName || item.userName || "?");
      const hostname = getHostname(item.siteUrl);
      const hasLock = !!item.pin || item.useBiometric;

      return (
        <Pressable
          onPress={() => handleProfileTap(item)}
          style={({ pressed }) => [
            styles.profileCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: pressed ? 0.02 : 0.06,
                  shadowRadius: 8,
                },
                android: { elevation: pressed ? 1 : 3 },
              }),
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text
              style={[styles.profileName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {item.fullName || item.userName}
            </Text>
            <View style={styles.serverRow}>
              <MaterialIcons name="dns" size={12} color={colors.muted} />
              <Text
                style={[styles.profileServer, { color: colors.muted }]}
                numberOfLines={1}
              >
                {hostname}
              </Text>
            </View>
            {item.driverName ? (
              <View style={styles.driverRow}>
                <MaterialIcons name="local-shipping" size={12} color={colors.primary} />
                <Text
                  style={[styles.profileDriver, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {item.driverName}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            {hasLock ? (
              <View style={[styles.lockIcon, { backgroundColor: colors.primary + "15" }]}>
                <MaterialIcons
                  name={item.useBiometric ? "fingerprint" : "lock"}
                  size={18}
                  color={colors.primary}
                />
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={24} color={colors.border} />
          </View>
        </Pressable>
      );
    },
    [colors, handleProfileTap]
  );

  // PIN entry overlay
  if (unlockingProfile) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
        <View style={[styles.pinOverlay, { backgroundColor: colors.background }]}>
          <LinearGradient
            colors={["#0A3D7A", "#0F5FC6", "#3B82F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pinHeader}
          >
            <TouchableOpacity
              style={styles.pinBackBtn}
              onPress={() => {
                setUnlockingProfile(null);
                setPinInput("");
                setPinError("");
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.pinContent}>
            <View style={[styles.pinAvatar, { backgroundColor: unlockingProfile.avatarColor }]}>
              <Text style={styles.pinAvatarText}>
                {getInitials(unlockingProfile.fullName || "?")}
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
              placeholder="- - - - - -"
              placeholderTextColor={colors.border}
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

            <TouchableOpacity
              style={[styles.pinUnlockBtn, { backgroundColor: colors.primary }]}
              onPress={handlePinSubmit}
              activeOpacity={0.8}
            >
              {isAuthenticating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="lock-open" size={20} color="#fff" />
                  <Text style={styles.pinUnlockText}>Unlock</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Hero Header */}
        <LinearGradient
          colors={["#0A3D7A", "#0F5FC6", "#3B82F6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroHeader}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroLogoBox}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 44, height: 44 }}
                contentFit="contain"
              />
            </View>
            <Text style={styles.heroTitle}>Driver</Text>
            <Text style={styles.heroSubtitle}>Select your profile to continue</Text>
          </View>
          <View style={styles.heroCurve}>
            <View style={[styles.heroCurveInner, { backgroundColor: colors.background }]} />
          </View>
        </LinearGradient>

        {/* Profiles Section */}
        <View style={styles.sectionHeader}>
          <MaterialIcons name="people" size={18} color={colors.muted} />
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>
            DRIVER PROFILES ({profiles.length})
          </Text>
        </View>

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
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <MaterialIcons name="person-add" size={40} color={colors.border} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No Profiles Yet
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Add a driver profile to connect to your fleet server
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={handleAddProfile}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={22} color="#fff" />
            <Text style={styles.addButtonText}>Add New Profile</Text>
          </TouchableOpacity>
          <Text style={[styles.branding, { color: colors.muted }]}>
            Powered by Agilasoft Cloud Technologies Inc.
          </Text>
        </View>
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
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Hero Header
  heroHeader: {
    paddingTop: 16,
    position: "relative",
    overflow: "hidden",
  },
  heroContent: {
    alignItems: "center",
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  heroLogoBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  heroCurve: {
    height: 20,
    overflow: "hidden",
  },
  heroCurveInner: {
    height: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // Section Header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Profile Cards
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
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
    gap: 2,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "600",
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  profileServer: {
    fontSize: 13,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  profileDriver: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 8,
  },
  lockIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
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

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
  },
  addButton: {
    flexDirection: "row",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  branding: {
    textAlign: "center",
    fontSize: 11,
    paddingTop: 16,
    paddingBottom: 4,
  },

  // PIN Overlay
  pinOverlay: {
    flex: 1,
  },
  pinHeader: {
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  pinBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  pinAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pinAvatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  pinTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  pinSubtitle: {
    fontSize: 15,
    marginTop: 6,
    marginBottom: 28,
  },
  pinInput: {
    width: "100%",
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    fontSize: 28,
    textAlign: "center",
    letterSpacing: 10,
    fontWeight: "600",
  },
  pinErrorText: {
    fontSize: 13,
    marginTop: 10,
    fontWeight: "500",
  },
  pinUnlockBtn: {
    flexDirection: "row",
    width: "100%",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    gap: 8,
  },
  pinUnlockText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },

  // Overlay
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
