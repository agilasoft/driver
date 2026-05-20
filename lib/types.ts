/**
 * Core type definitions for the Driver app.
 */

export interface DriverProfile {
  id: string;
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
  userName: string;
  fullName: string;
  driverName: string;
  driverId: string;
  avatarColor: string;
  pin?: string;
  useBiometric?: boolean;
  createdAt: string;
}

export interface AuthState {
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
  userName: string;
  fullName: string;
  driverName: string;
  driverId: string;
}

export interface RunSheet {
  name: string;
  status: string;
  driver: string;
  driver_name: string;
  posting_date: string;
  route?: string;
  vehicle?: string;
  total_legs?: number;
  modified: string;
}

export interface TransportLeg {
  name: string;
  parent: string;
  idx: number;
  status: string;
  transport_job?: string;
  facility_from?: string;
  facility_to?: string;
  pick_address?: string;
  drop_address?: string;
  pick_latitude?: number;
  pick_longitude?: number;
  drop_latitude?: number;
  drop_longitude?: number;
  start_date?: string;
  end_date?: string;
  date_signed?: string;
  pick_signature?: string;
  drop_signature?: string;
  pick_signed_by?: string;
  drop_signed_by?: string;
  pick_notes?: string;
  drop_notes?: string;
  pick_photo?: string;
  drop_photo?: string;
  cargo_description?: string;
  weight?: number;
  volume?: number;
  reference_number?: string;
}

export interface RunSheetBundle {
  doc: RunSheet;
  legs: TransportLeg[];
}

export interface PendingChange {
  id: string;
  legName: string;
  runSheetName: string;
  timestamp: string;
  changes: Partial<TransportLeg>;
  photoUri?: string;
  photoType?: "pick" | "drop";
  synced: boolean;
}

export interface PendingStatusChange {
  runSheetName: string;
  status: string;
  timestamp: string;
}
