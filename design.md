# Driver App - Design Document

## Architecture: Flat Routing (No Conditional Mounting)

The key design principle is that **ALL routes are always registered** in the Expo Router Stack. Authentication is enforced via **redirect logic inside each protected screen**, not by conditionally mounting/unmounting route components. This prevents "Unmatched Route" errors on Android cold start via deep link scheme.

### Route Structure (app/ directory)

```
app/
  _layout.tsx          ← Root Stack with ALL screens always registered
  index.tsx            ← Entry redirect: checks auth → goes to profile-picker or (tabs)
  profile-picker.tsx   ← Landing screen: list of driver profiles, add new
  login.tsx            ← Add/edit profile: Frappe server URL + API key/secret
  (tabs)/
    _layout.tsx        ← Tab bar: Current Job, Run Sheets, Settings
    index.tsx          ← Current Job tab
    run-sheets.tsx     ← Run Sheets list tab
    settings.tsx       ← Settings tab
  run-sheet/
    [id].tsx           ← Run sheet detail with leg cards
  leg/
    [legId].tsx        ← Leg detail with pick/drop actions
  signature-modal.tsx  ← Signature capture (full screen modal)
  barcode-scanner.tsx  ← Barcode/QR scanner
```

### Auth Flow (redirect-based, never conditional mounting)

1. App launches → `app/index.tsx` checks if any profile is unlocked
2. If no profile unlocked → redirect to `/profile-picker`
3. User taps profile → PIN/biometric check → on success, mark profile as active
4. Active profile → redirect to `/(tabs)`
5. Session timeout → redirect back to `/profile-picker`

### Key Principle

The `_layout.tsx` root layout **NEVER** conditionally renders routes. It always has:
```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="index" />
  <Stack.Screen name="profile-picker" />
  <Stack.Screen name="login" />
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="run-sheet/[id]" />
  <Stack.Screen name="leg/[legId]" />
  <Stack.Screen name="signature-modal" options={{ presentation: "modal" }} />
  <Stack.Screen name="barcode-scanner" options={{ presentation: "modal" }} />
</Stack>
```

---

## Screen List

### 1. Profile Picker (Landing)
- Blue gradient header with app logo + "Driver" title
- List of saved driver profiles (cards with avatar, name, host URL)
- Orange FAB (+) to add new profile
- Tap profile → PIN pad or biometric prompt
- "Powered by Agilasoft Cloud Technologies Inc." footer

### 2. Login / Add Profile
- Step-based form: Server URL → API Key → API Secret
- Test Connection button
- Save profile to AsyncStorage

### 3. Current Job Tab (Home)
- Blue gradient header with driver name, shift clock, GPS indicator
- Progress bar showing completed legs / total legs
- "Next Stop" card with navigate button
- FlatList of all legs with completion status
- "Complete Job" button when all legs done

### 4. Run Sheets Tab
- Blue gradient header
- Search bar + date filter chips (Today, This Week, All)
- FlatList of run sheet cards with progress indicators
- Tap card → set as current job or view detail

### 5. Settings Tab
- Blue gradient header with driver name
- Profile management (edit, switch, delete)
- Session timeout configuration
- Live location toggle
- Geofence alerts toggle
- Shift log
- Sync status + manual sync button
- Logout / lock

### 6. Run Sheet Detail
- Native header with back button
- Document info card
- Status transition buttons (Start Trip, Complete, Hold, Resume)
- Leg cards with pick/drop progress indicators
- Navigate buttons for each leg

### 7. Leg Detail
- Native header with back button
- Route visualization (from → to)
- Navigate to Pick-up / Drop-off buttons
- Pick-up section: timestamp, GPS, signature, signed-by, notes, photo, barcode
- Drop-off section: same fields
- Floating Save button

### 8. Signature Modal
- Full-screen drawing canvas
- Clear + Save buttons
- Gesture-based drawing with react-native-gesture-handler

### 9. Barcode Scanner
- Camera view with overlay
- Auto-detect and return barcode data

---

## Color Choices (CargoNext Branding)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary (blue) | #3478C6 | #5B9BD5 | Headers, buttons, links |
| accent (orange) | #F27A2E | #F27A2E | FAB, highlights, active states |
| background | #FFFFFF | #151718 | Screen backgrounds |
| surface | #F5F5F7 | #1E2022 | Cards, input fields |
| foreground | #1A1A1A | #ECEDEE | Primary text |
| muted | #8E8E93 | #9BA1A6 | Secondary text |
| border | #E5E5EA | #334155 | Dividers |
| success | #34C759 | #4ADE80 | Completed states |
| warning | #FF9500 | #FBBF24 | Hold/partial states |
| error | #FF3B30 | #F87171 | Error states |

---

## Key User Flows

### Flow 1: First Launch
Profile Picker (empty) → Tap (+) → Login screen → Enter credentials → Test → Save → Back to Profile Picker → Tap profile → PIN setup → Unlocked → Current Job tab

### Flow 2: Returning Driver
Profile Picker → Tap profile → Enter PIN → Current Job tab → Tap "Next Stop" → Leg Detail → Record timestamp → Capture signature → Save → Back

### Flow 3: Complete a Job
Current Job tab → All legs show green → Tap "Complete Job" → Confirm → Status updated → Done

### Flow 4: Session Timeout
App idle → Timer expires → Redirect to Profile Picker → Must re-authenticate
