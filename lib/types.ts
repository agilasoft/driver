// CargoNext Run Sheet & Transport Leg data types

export interface RunSheet {
  name: string;
  run_date: string;
  run_type: string;
  route_name: string;
  status: RunSheetStatus;
  vehicle_type: string;
  vehicle: string;
  transport_company: string;
  driver: string;
  driver_name: string;
  dispatch_terminal: string;
  return_terminal: string;
  estimated_dispatch_datetime: string;
  estimated_return_datetime: string;
}

export type RunSheetStatus =
  | "Draft"
  | "Dispatched"
  | "In-Progress"
  | "Hold"
  | "Completed"
  | "Cancelled";

export interface TransportLeg {
  name: string;
  date: string;
  transport_job: string;
  vehicle_type: string;
  facility_type_from: string;
  facility_from: string;
  pick_address: string;
  facility_type_to: string;
  facility_to: string;
  drop_address: string;
  start_date: string;
  end_date: string;
  distance_km: number;
  duration_min: number;
  pick_signature: string;
  pick_signed_by: string;
  drop_signature: string;
  drop_signed_by: string;
  date_signed: string;
  status: LegStatus;
  actual_distance_km: number;
  actual_duration_min: number;
  // GPS coordinates captured at pick/drop
  pick_latitude?: number;
  pick_longitude?: number;
  drop_latitude?: number;
  drop_longitude?: number;
  // Aliases from API
  signature?: string;
  signed_by?: string;
  route_distance_km?: number;
  route_duration_min?: number;
}

export type LegStatus =
  | "Open"
  | "Assigned"
  | "Started"
  | "Completed"
  | "Billed";

export interface RunSheetBundle {
  doc: RunSheet;
  legs: TransportLeg[];
}

// Offline sync types
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

export interface GpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface PendingStatusChange {
  runSheetName: string;
  status: string;
  timestamp: string;
}

export interface AuthState {
  siteUrl: string;
  apiKey: string;
  apiSecret: string;
  userName: string;
  fullName: string;
  isLoggedIn: boolean;
  driverId?: string;
  driverName?: string;
  driverLinkError?: string;
}
