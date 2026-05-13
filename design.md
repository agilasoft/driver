# Driver App — Interface Design

## Overview

The Driver app is a mobile-first logistics companion for truck/delivery drivers using the CargoNext system. It connects to a Frappe/ERPNext backend to display assigned Run Sheets and their Transport Legs. Drivers can capture signatures, photos, and timestamps for pick-up and drop-off events — even while offline. All pending changes sync automatically when connectivity is restored.

## Color Palette

The app uses a professional logistics color scheme inspired by CargoNext branding, with a dark navy primary and vibrant accent for actions.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #1B3A5C | #4A90D9 | Headers, active tabs, primary buttons |
| background | #F5F7FA | #0F1419 | Screen backgrounds |
| surface | #FFFFFF | #1A2332 | Cards, modals, sheets |
| foreground | #1A1A2E | #E8ECF0 | Primary text |
| muted | #6B7B8D | #8899AA | Secondary text, labels |
| border | #DDE3EA | #2A3A4A | Dividers, card borders |
| success | #10B981 | #34D399 | Completed status, success toasts |
| warning | #F59E0B | #FBBF24 | In-progress, hold status |
| error | #EF4444 | #F87171 | Cancelled, error states |

## Screen List

### 1. Login Screen
Full-screen login with Frappe site URL, username, and password fields. Stores credentials securely for API calls. Minimal branding with the Driver logo at top.

### 2. Run Sheets (Home / Tab 1)
A FlatList of assigned Run Sheets for the logged-in driver. Each card shows: Run Sheet ID, run date, route name, status badge, vehicle info, and leg count. Pull-to-refresh to fetch latest. A connectivity banner at the top shows online/offline status and pending sync count.

### 3. Run Sheet Detail
Header section with Run Sheet metadata (date, route, vehicle, status). Below is a FlatList of Transport Legs as cards. Each leg card shows: origin → destination, pick/drop times, status badge, and icons indicating whether signature/photo have been captured. Tapping a leg navigates to the Leg Detail screen.

### 4. Leg Detail
A scrollable detail view for a single Transport Leg. Organized in two sections:

**Pick Section:** Pick facility name and address, pick window times, pick timestamp (tap to record now), signature pad (tap to open capture), photo thumbnail (tap to capture/view), signed-by name field.

**Drop Section:** Same layout as Pick but for drop-off data.

A floating "Save" button at the bottom persists changes locally and queues for sync.

### 5. Signature Capture (Modal)
A full-screen modal with a signature drawing canvas. Clear button to reset. Done button to save the signature as a base64 image string. Cancel to dismiss.

### 6. Photo Capture (Modal)
Opens the device camera to take a photo. After capture, shows a preview with Retake/Use Photo options. Saves the photo URI locally.

### 7. Settings (Tab 2)
Server URL configuration, logged-in user info, logout button, sync status summary (pending items count), and a manual "Sync Now" button. Dark/light mode toggle.

## Primary Content and Functionality

| Screen | Content | Functionality |
|--------|---------|---------------|
| Login | Site URL, username, password fields | Authenticate with Frappe API, store session |
| Run Sheets | List of Run Sheet cards | Pull-to-refresh, filter by status, tap to detail |
| Run Sheet Detail | Header info + list of leg cards | View all legs, tap leg to edit |
| Leg Detail | Pick/Drop sections with fields | Capture signature, photo, timestamp; save offline |
| Signature Capture | Drawing canvas | Draw signature, clear, save |
| Photo Capture | Camera viewfinder / preview | Take photo, retake, confirm |
| Settings | User info, sync status | Logout, manual sync, server config |

## Key User Flows

### Flow 1: View and Update a Leg
1. Driver opens app → sees Run Sheets list (Home tab)
2. Taps a Run Sheet → sees list of legs
3. Taps a leg → sees Leg Detail with Pick and Drop sections
4. Taps "Capture Signature" under Pick → Signature modal opens
5. Signs on canvas → taps Done → signature saved locally
6. Taps camera icon under Pick → takes photo → confirms
7. Taps "Record Time" → current timestamp is set
8. Taps "Save" → changes stored in offline queue
9. When online, sync engine pushes updates to Frappe

### Flow 2: Offline Workflow
1. Driver goes into area with no connectivity
2. Connectivity banner shows "Offline — 0 pending"
3. Driver continues to capture signatures, photos, timestamps
4. Each save increments pending count on banner
5. When connectivity returns, banner shows "Syncing..."
6. After sync completes, banner shows "Online — All synced"

### Flow 3: Login
1. Driver enters Frappe site URL (e.g., https://erp.company.com)
2. Enters username and password
3. App authenticates and stores session cookies/token
4. Navigates to Run Sheets list

## Navigation Structure

- **Tab Bar** with 2 tabs:
  - Tab 1: "Run Sheets" (truck icon) — the main working screen
  - Tab 2: "Settings" (gear icon) — configuration and sync

- **Stack Navigation** within Tab 1:
  - Run Sheets List → Run Sheet Detail → Leg Detail
  - Leg Detail opens Signature Capture and Photo Capture as modals

## Layout Principles

All screens assume portrait orientation (9:16) and one-handed usage. Primary actions are placed in the bottom half of the screen. Cards use generous padding (16px) and rounded corners (12px). Status badges use pill shapes with semantic colors. The tab bar uses standard iOS height with clear iconography.
