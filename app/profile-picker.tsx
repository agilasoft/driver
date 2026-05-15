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
  Dimensions,
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

const HEADER_BLUE = "#3478C6";
const HEADER_BLUE_LIGHT = "#5B9BD5";
const FAB_ORANGE = "#F27A2E";

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
    try { return new URL(url).hostname; } catch { return url; }
  };

  const getInitials = (name: string) =>
    (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().substring(0, 2);

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
              backgroundColor: "#FFFFFF",
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {item.fullName || item.userName}
            </Text>
            <Text style={styles.profileServer} numberOfLines={1}>
              {hostname}
            </Text>
            {item.driverName ? (
              <Text style={[styles.profileDriver, { color: HEADER_BLUE }]} numberOfLines={1}>
                {item.driverName}
              </Text>
            ) : null}
          </View>
          {hasLock ? (
            <View style={styles.lockIcon}>
              <MaterialIcons
                name={item.useBiometric ? "fingerprint" : "lock"}
                size={18}
                color={HEADER_BLUE}
              />
            </View>
          ) : null}
          <MaterialIcons name="chevron-right" size={22} color="#C7C7CC" />
        </Pressable>
      );
    },
    [handleProfileTap]
  );

  // PIN entry overlay
  if (unlockingProfile) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
        <View style={styles.pinOverlay}>
          {/* Blue header */}
          <LinearGradient
            colors={[HEADER_BLUE, HEADER_BLUE_LIGHT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.pinGradientHeader}
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
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.pinHeaderTitle}>Unlock Profile</Text>
            <View style={{ width: 40 }} />
          </LinearGradient>

          <View style={styles.pinContent}>
            <View style={[styles.pinAvatar, { backgroundColor: unlockingProfile.avatarColor }]}>
              <Text style={styles.pinAvatarText}>
                {getInitials(unlockingProfile.fullName || "?")}
              </Text>
            </View>
            <Text style={styles.pinTitle}>
              {unlockingProfile.fullName || unlockingProfile.userName}
            </Text>
            <Text style={styles.pinSubtitle}>Enter your PIN to unlock</Text>

            <TextInput
              style={[
                styles.pinInput,
                { borderColor: pinError ? "#FF3B30" : "#E5E5EA" },
              ]}
              value={pinInput}
              onChangeText={(text) => {
                setPinInput(text.replace(/[^0-9]/g, ""));
                setPinError("");
              }}
              placeholder="- - - - - -"
              placeholderTextColor="#C7C7CC"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handlePinSubmit}
            />

            {pinError ? (
              <Text style={styles.pinErrorText}>{pinError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.pinUnlockBtn, { backgroundColor: HEADER_BLUE }]}
              onPress={handlePinSubmit}
              activeOpacity={0.8}
            >
              {isAuthenticating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pinUnlockText}>Unlock</Text>
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
          <ActivityIndicator size="large" color={HEADER_BLUE} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="flex-1">
      <View style={styles.container}>
        {/* Blue gradient header — matches CargoNext exactly */}
        <LinearGradient
          colors={[HEADER_BLUE, HEADER_BLUE_LIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerLogoBox}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 40, height: 40 }}
              contentFit="contain"
            />
          </View>
          <Text style={styles.headerTitle}>Driver</Text>
          <Text style={styles.headerSubtitle}>Select a host to connect</Text>
        </LinearGradient>

        {/* Body */}
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
            <View style={styles.emptyIconBox}>
              <MaterialIcons name="dns" size={40} color="#C7C7CC" />
            </View>
            <Text style={styles.emptyTitle}>No Hosts Added</Text>
            <Text style={styles.emptySubtitle}>
              Add a host to get started. You can add{"\n"}multiple hosts and switch between them.
            </Text>
          </View>
        )}

        {/* Branding footer */}
        <Text style={styles.branding}>
          Powered by Agilasoft Cloud Technologies Inc.
        </Text>

        {/* Orange FAB — matches CargoNext exactly */}
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAddProfile}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={28} color="#fff" />
        </TouchableOpacity>
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
    backgroundColor: "#FFFFFF",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  // Header
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: "center",
  },
  headerLogoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },

  // Profile Cards
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
    }),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  profileServer: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 1,
  },
  profileDriver: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  lockIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(52,120,198,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F5F5F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: 48,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: FAB_ORANGE,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: FAB_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      web: {
        shadowColor: FAB_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
    }),
  },

  // Branding
  branding: {
    textAlign: "center",
    fontSize: 11,
    color: "#8E8E93",
    paddingBottom: 20,
    paddingTop: 8,
  },

  // PIN Overlay
  pinOverlay: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  pinGradientHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  pinBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
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
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
  },
  pinSubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    marginTop: 6,
    marginBottom: 28,
  },
  pinInput: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "#F5F5F7",
    paddingHorizontal: 20,
    fontSize: 28,
    textAlign: "center",
    letterSpacing: 10,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  pinErrorText: {
    fontSize: 13,
    color: "#FF3B30",
    marginTop: 10,
    fontWeight: "500",
  },
  pinUnlockBtn: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
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
