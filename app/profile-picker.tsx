import React, { useState, useEffect, useCallback, useRef, memo } from "react";
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
  Animated,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  type DriverProfile,
  verifyPin,
  checkBiometricAvailability,
  authenticateWithBiometric,
} from "@/lib/profile-manager";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BLUE = "#3478C6";
const BLUE_LIGHT = "#5B9BD5";
const ORANGE = "#F27A2E";
const FG = "#1A1A1A";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const SURFACE = "#F5F5F7";
const DELETE_RED = "#FF3B30";

// Swipeable profile card component
function SwipeableProfileCard({
  item,
  onTap,
  onEdit,
  onDelete,
}: {
  item: DriverProfile;
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwiped = useRef(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const ACTION_WIDTH = 140; // width for both edit + delete buttons

  const getInitials = (name: string) =>
    (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().substring(0, 2);

  const getHostname = (url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  const initials = getInitials(item.fullName || item.userName || "?");
  const hostname = getHostname(item.siteUrl);
  const hasLock = !!item.pin || item.useBiometric;

  const resetSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
    isSwiped.current = false;
  }, [translateX]);

  const openSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: -ACTION_WIDTH,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
    isSwiped.current = true;
  }, [translateX]);

  const handleTouchStart = useCallback((e: any) => {
    startX.current = e.nativeEvent.pageX;
    currentX.current = isSwiped.current ? -ACTION_WIDTH : 0;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    const dx = e.nativeEvent.pageX - startX.current;
    const newX = Math.min(0, Math.max(-ACTION_WIDTH - 20, currentX.current + dx));
    translateX.setValue(newX);
  }, [translateX]);

  const handleTouchEnd = useCallback((e: any) => {
    const dx = e.nativeEvent.pageX - startX.current;
    const finalX = currentX.current + dx;

    // If barely moved, treat as tap
    if (Math.abs(dx) < 10) {
      if (isSwiped.current) {
        resetSwipe();
      } else {
        onTap();
      }
      return;
    }

    // Determine if we should open or close
    if (finalX < -ACTION_WIDTH / 2) {
      openSwipe();
    } else {
      resetSwipe();
    }
  }, [resetSwipe, openSwipe, onTap]);

  return (
    <View style={st.swipeContainer}>
      {/* Background action buttons */}
      <View style={st.actionsContainer}>
        <TouchableOpacity
          style={st.editAction}
          onPress={() => {
            resetSwipe();
            onEdit();
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="edit" size={20} color="#fff" />
          <Text style={st.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.deleteAction}
          onPress={() => {
            resetSwipe();
            onDelete();
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="delete" size={20} color="#fff" />
          <Text style={st.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Foreground card */}
      <Animated.View
        style={[
          st.profileCard,
          { transform: [{ translateX }] },
        ]}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Avatar */}
        <View style={[st.avatar, { backgroundColor: item.avatarColor }]}>
          <Text style={st.avatarText}>{initials}</Text>
        </View>

        {/* Profile Info */}
        <View style={st.profileInfo}>
          <Text style={st.profileName} numberOfLines={1}>
            {item.fullName || item.userName || "Unknown User"}
          </Text>
          <View style={st.hostRow}>
            <MaterialIcons name="dns" size={13} color={GRAY} />
            <Text style={st.profileHost} numberOfLines={1}>{hostname}</Text>
          </View>
          {item.driverName ? (
            <View style={st.driverRow}>
              <MaterialIcons name="local-shipping" size={13} color={BLUE} />
              <Text style={st.profileDriver} numberOfLines={1}>{item.driverName}</Text>
            </View>
          ) : null}
        </View>

        {/* Security indicator */}
        {hasLock ? (
          <View style={st.lockBadge}>
            <MaterialIcons
              name={item.useBiometric ? "fingerprint" : "lock"}
              size={16}
              color={BLUE}
            />
          </View>
        ) : null}
        <MaterialIcons name="chevron-right" size={22} color="#C7C7CC" />
      </Animated.View>
    </View>
  );
}

export default function ProfilePickerScreen() {
  const router = useRouter();
  const { profiles, switchToProfile, removeProfile, loadProfiles, isLoading } = useAuth();
  const [unlockingProfile, setUnlockingProfile] = useState<DriverProfile | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleProfileTap = useCallback(
    async (profile: DriverProfile) => {
      // If no security set, go straight in
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

      // Try biometric first
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

  const handleEditProfile = useCallback(
    (profile: DriverProfile) => {
      router.push({ pathname: "/edit-profile", params: { profileId: profile.id } });
    },
    [router]
  );

  const handleDeleteProfile = useCallback(
    (profile: DriverProfile) => {
      Alert.alert(
        "Delete Profile",
        `Remove "${profile.fullName || profile.userName}" from this device? This won't affect the server account.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              await removeProfile(profile.id);
            },
          },
        ]
      );
    },
    [removeProfile]
  );

  const renderProfile = useCallback(
    ({ item }: { item: DriverProfile }) => (
      <SwipeableProfileCard
        item={item}
        onTap={() => handleProfileTap(item)}
        onEdit={() => handleEditProfile(item)}
        onDelete={() => handleDeleteProfile(item)}
      />
    ),
    [handleProfileTap, handleEditProfile, handleDeleteProfile]
  );

  // PIN entry overlay
  if (unlockingProfile) {
    const getInitials = (name: string) =>
      (name || "?").split(" ").map((w) => w[0]).join("").toUpperCase().substring(0, 2);

    return (
      <ScreenContainer edges={["bottom", "left", "right"]} className="flex-1">
        <View style={st.pinOverlay}>
          <LinearGradient
            colors={[BLUE, BLUE_LIGHT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[st.pinGradientHeader, { paddingTop: useSafeAreaInsets().top + 8 }]}
          >
            <TouchableOpacity
              style={st.pinBackBtn}
              onPress={() => {
                setUnlockingProfile(null);
                setPinInput("");
                setPinError("");
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={st.pinHeaderTitle}>Unlock Profile</Text>
            <View style={{ width: 40 }} />
          </LinearGradient>

          <View style={st.pinContent}>
            <View style={[st.pinAvatar, { backgroundColor: unlockingProfile.avatarColor }]}>
              <Text style={st.pinAvatarText}>
                {getInitials(unlockingProfile.fullName || "?")}
              </Text>
            </View>
            <Text style={st.pinTitle}>
              {unlockingProfile.fullName || unlockingProfile.userName}
            </Text>
            <Text style={st.pinSubtitle}>Enter your PIN to unlock</Text>

            <TextInput
              style={[st.pinInput, { borderColor: pinError ? "#FF3B30" : BORDER }]}
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

            {pinError ? <Text style={st.pinErrorText}>{pinError}</Text> : null}

            <TouchableOpacity
              style={st.pinUnlockBtn}
              onPress={handlePinSubmit}
              activeOpacity={0.8}
            >
              {isAuthenticating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.pinUnlockText}>Unlock</Text>
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
        <View style={st.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["bottom", "left", "right"]} className="flex-1">
      <View style={st.container}>
        {/* Blue gradient header — extends to top edge behind status bar */}
        <LinearGradient
          colors={[BLUE, BLUE_LIGHT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[st.header, { paddingTop: useSafeAreaInsets().top + 12 }]}
        >
          <View style={st.headerLogoBox}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 56, height: 56, borderRadius: 14 }}
              contentFit="cover"
            />
          </View>
          <Text style={st.headerTitle}>Driver</Text>
          <Text style={st.headerSubtitle}>Select a host to connect</Text>
        </LinearGradient>

        {/* Swipe hint */}
        {profiles.length > 0 ? (
          <>
            <View style={st.sectionLabelRow}>
              <Text style={st.sectionLabel}>
                {profiles.length} {profiles.length === 1 ? "Host" : "Hosts"}
              </Text>
              <Text style={st.swipeHint}>Swipe left to edit or delete</Text>
            </View>
            <FlatList
              data={profiles.sort(
                (a, b) =>
                  new Date(b.lastUsedAt).getTime() -
                  new Date(a.lastUsedAt).getTime()
              )}
              renderItem={renderProfile}
              keyExtractor={(item) => item.id}
              contentContainerStyle={st.listContent}
              showsVerticalScrollIndicator={false}
            />
          </>
        ) : (
          <View style={st.emptyContainer}>
            <View style={st.emptyIconBox}>
              <MaterialIcons name="dns" size={40} color="#C7C7CC" />
            </View>
            <Text style={st.emptyTitle}>No Hosts Added</Text>
            <Text style={st.emptySubtitle}>
              Add a host to get started. You can add{"\n"}multiple hosts and switch between them.
            </Text>
          </View>
        )}

        {/* Branding footer */}
        <Text style={st.branding}>Powered by Agilasoft Cloud Technologies Inc.</Text>

        {/* Orange FAB */}
        <TouchableOpacity
          style={st.fab}
          onPress={handleAddProfile}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {isAuthenticating ? (
        <View style={st.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={st.overlayText}>Connecting...</Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },

  // Header
  header: { paddingTop: 20, paddingBottom: 24, alignItems: "center" },
  headerLogoBox: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: "transparent",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF", letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 2 },

  // Section label
  sectionLabelRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  swipeHint: { fontSize: 11, color: "#C7C7CC", fontStyle: "italic" },

  // Swipe container
  swipeContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
  },

  // Action buttons behind card
  actionsContainer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    width: 140,
    borderRadius: 12,
    overflow: "hidden",
  },
  editAction: {
    flex: 1,
    backgroundColor: BLUE,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  deleteAction: {
    flex: 1,
    backgroundColor: DELETE_RED,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  actionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },

  // Profile Cards
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  profileCard: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 2 },
      web: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 6 },
    }),
  },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 16, fontWeight: "600", color: FG },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  profileHost: { fontSize: 13, color: GRAY, flex: 1 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  profileDriver: { fontSize: 12, fontWeight: "500", color: BLUE },
  lockBadge: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(52,120,198,0.1)",
    alignItems: "center", justifyContent: "center", marginRight: 6,
  },

  // Empty State
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  emptyIconBox: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: SURFACE,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: FG, textAlign: "center" },
  emptySubtitle: { fontSize: 14, color: GRAY, textAlign: "center", marginTop: 8, lineHeight: 20 },

  // FAB
  fab: {
    position: "absolute", bottom: 48, right: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: ORANGE,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 6 },
      web: { shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
    }),
  },

  // Branding
  branding: { textAlign: "center", fontSize: 11, color: GRAY, paddingBottom: 20, paddingTop: 8 },

  // PIN Overlay
  pinOverlay: { flex: 1, backgroundColor: "#FFFFFF" },
  pinGradientHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 8, paddingBottom: 16, paddingHorizontal: 16,
  },
  pinBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  pinHeaderTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  pinContent: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  pinAvatar: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  pinAvatarText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  pinTitle: { fontSize: 22, fontWeight: "700", color: FG, textAlign: "center" },
  pinSubtitle: { fontSize: 15, color: GRAY, marginTop: 6, marginBottom: 28 },
  pinInput: {
    width: "100%", height: 56, borderRadius: 12, borderWidth: 1.5,
    backgroundColor: SURFACE, paddingHorizontal: 20,
    fontSize: 28, textAlign: "center", letterSpacing: 10, fontWeight: "600", color: FG,
  },
  pinErrorText: { fontSize: 13, color: "#FF3B30", marginTop: 10, fontWeight: "500" },
  pinUnlockBtn: {
    width: "100%", height: 50, borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginTop: 24, backgroundColor: BLUE,
  },
  pinUnlockText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
  },
  overlayText: { color: "#fff", fontSize: 15, marginTop: 12 },
});
