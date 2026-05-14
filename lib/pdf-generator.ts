import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Alert } from "react-native";
import type { RunSheetBundle, TransportLeg } from "./types";

// ─── SVG Signature Rendering ────────────────────────────────
// Signatures are stored as SVG path strings in AsyncStorage
// We render them as inline SVG in the PDF HTML

async function getSignatureSvg(
  legId: string,
  type: "pick" | "drop"
): Promise<string | null> {
  try {
    const key = `sig_${legId}_${type}`;
    const pathData = await AsyncStorage.getItem(key);
    if (!pathData) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 250" width="300" height="120" style="border:1px solid #E5E7EB; border-radius:8px; background:#fff;">
      <path d="${pathData}" stroke="#1A1A2E" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="30" y1="200" x2="320" y2="200" stroke="#E5E7EB" stroke-width="1"/>
      <text x="30" y="230" font-size="10" fill="#687076">Signature</text>
    </svg>`;
  } catch {
    return null;
  }
}

// ─── Photo to Base64 ────────────────────────────────────────
// Photos stored locally need to be converted to base64 for iOS WKWebView

async function getPhotoBase64(
  legId: string,
  type: "pick" | "drop"
): Promise<string | null> {
  try {
    const key = `photo_${legId}_${type}`;
    const uri = await AsyncStorage.getItem(key);
    if (!uri) return null;

    // Check if file exists
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

// ─── Date Formatting ────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatGps(lat?: number, lng?: number): string {
  if (!lat && !lng) return "Not recorded";
  return `${(lat || 0).toFixed(6)}, ${(lng || 0).toFixed(6)}`;
}

// ─── HTML Template ──────────────────────────────────────────

function buildLegHtml(
  leg: TransportLeg,
  index: number,
  pickSigSvg: string | null,
  dropSigSvg: string | null,
  pickPhotoB64: string | null,
  dropPhotoB64: string | null
): string {
  return `
    <div class="leg-card" style="page-break-inside: avoid;">
      <div class="leg-header">
        <span class="leg-number">${index + 1}</span>
        <span class="leg-name">${leg.name}</span>
        <span class="leg-status status-${(leg.status || "Open").toLowerCase().replace(/\s+/g, "-")}">${leg.status || "Open"}</span>
      </div>

      <div class="leg-route">
        <div class="route-point">
          <span class="dot green"></span>
          <div>
            <strong>${leg.facility_from || "Pick-up"}</strong>
            <div class="address">${leg.pick_address || "—"}</div>
          </div>
        </div>
        <div class="route-line"></div>
        <div class="route-point">
          <span class="dot red"></span>
          <div>
            <strong>${leg.facility_to || "Drop-off"}</strong>
            <div class="address">${leg.drop_address || "—"}</div>
          </div>
        </div>
      </div>

      ${
        leg.distance_km || leg.duration_min
          ? `<div class="leg-metrics">
              ${leg.distance_km ? `<span>Distance: <strong>${leg.distance_km.toFixed(1)} km</strong></span>` : ""}
              ${leg.duration_min ? `<span>Duration: <strong>${leg.duration_min} min</strong></span>` : ""}
            </div>`
          : ""
      }

      <table class="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Pick-up</th>
            <th>Drop-off</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="label">Timestamp</td>
            <td>${leg.start_date ? formatDate(leg.start_date) : '<span class="na">Not recorded</span>'}</td>
            <td>${leg.end_date ? formatDate(leg.end_date) : '<span class="na">Not recorded</span>'}</td>
          </tr>
          <tr>
            <td class="label">Signed By</td>
            <td>${leg.pick_signed_by || '<span class="na">—</span>'}</td>
            <td>${leg.drop_signed_by || '<span class="na">—</span>'}</td>
          </tr>
          <tr>
            <td class="label">GPS Location</td>
            <td>${formatGps(leg.pick_latitude, leg.pick_longitude)}</td>
            <td>${formatGps(leg.drop_latitude, leg.drop_longitude)}</td>
          </tr>
        </tbody>
      </table>

      <div class="signatures-row">
        <div class="sig-block">
          <div class="sig-label">Pick-up Signature</div>
          ${pickSigSvg ? pickSigSvg : '<div class="sig-empty">No signature captured</div>'}
        </div>
        <div class="sig-block">
          <div class="sig-label">Drop-off Signature</div>
          ${dropSigSvg ? dropSigSvg : '<div class="sig-empty">No signature captured</div>'}
        </div>
      </div>

      <div class="photos-row">
        <div class="photo-block">
          <div class="photo-label">Pick-up Photo</div>
          ${pickPhotoB64 ? `<img src="${pickPhotoB64}" class="photo-img"/>` : '<div class="photo-empty">No photo captured</div>'}
        </div>
        <div class="photo-block">
          <div class="photo-label">Drop-off Photo</div>
          ${dropPhotoB64 ? `<img src="${dropPhotoB64}" class="photo-img"/>` : '<div class="photo-empty">No photo captured</div>'}
        </div>
      </div>
    </div>
  `;
}

function buildFullHtml(
  bundle: RunSheetBundle,
  legHtmlParts: string[],
  generatedAt: string
): string {
  const doc = bundle.doc;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Run Sheet Summary - ${doc.name}</title>
  <style>
    @page { margin: 16mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #11181C;
      line-height: 1.5;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #0D3B66;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 22px;
      color: #0D3B66;
      margin-bottom: 2px;
    }
    .header .subtitle {
      font-size: 12px;
      color: #687076;
    }
    .summary-card {
      background: #f8f9fa;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 24px;
    }
    .summary-item {
      display: flex;
      gap: 6px;
    }
    .summary-item .label {
      color: #687076;
      font-size: 10px;
      min-width: 80px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .summary-item .value {
      font-size: 11px;
      font-weight: 500;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-completed { background: #dcfce7; color: #166534; }
    .status-dispatched { background: #dbeafe; color: #1e40af; }
    .status-in-progress { background: #fef3c7; color: #92400e; }
    .status-hold { background: #fce4ec; color: #b71c1c; }
    .status-draft { background: #f3f4f6; color: #374151; }
    .status-cancelled { background: #fee2e2; color: #991b1b; }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0D3B66;
      margin: 20px 0 10px;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 6px;
    }
    .leg-card {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 14px;
      background: #fff;
    }
    .leg-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .leg-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #0D3B66;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    .leg-name {
      font-weight: 600;
      font-size: 12px;
      flex: 1;
    }
    .leg-status {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .leg-status.status-open { background: #f3f4f6; color: #374151; }
    .leg-status.status-assigned { background: #dbeafe; color: #1e40af; }
    .leg-status.status-started { background: #fef3c7; color: #92400e; }
    .leg-status.status-completed { background: #dcfce7; color: #166534; }
    .leg-status.status-billed { background: #e0e7ff; color: #3730a3; }
    .leg-route {
      margin-bottom: 10px;
      padding-left: 4px;
    }
    .route-point {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .route-line {
      width: 2px;
      height: 12px;
      background: #E5E7EB;
      margin-left: 5px;
    }
    .dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .dot.green { background: #22C55E; }
    .dot.red { background: #EF4444; }
    .address { font-size: 10px; color: #687076; }
    .leg-metrics {
      display: flex;
      gap: 16px;
      margin-bottom: 10px;
      font-size: 10px;
      color: #687076;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10px;
    }
    .data-table th {
      background: #f8f9fa;
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
      border-bottom: 1px solid #E5E7EB;
      color: #0D3B66;
    }
    .data-table td {
      padding: 5px 8px;
      border-bottom: 1px solid #f3f4f6;
    }
    .data-table td.label {
      font-weight: 600;
      color: #687076;
      width: 90px;
    }
    .na { color: #9BA1A6; font-style: italic; }
    .signatures-row, .photos-row {
      display: flex;
      gap: 14px;
      margin-bottom: 10px;
    }
    .sig-block, .photo-block {
      flex: 1;
    }
    .sig-label, .photo-label {
      font-size: 10px;
      font-weight: 600;
      color: #687076;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .sig-empty, .photo-empty {
      border: 1px dashed #E5E7EB;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      color: #9BA1A6;
      font-size: 10px;
      font-style: italic;
    }
    .photo-img {
      width: 100%;
      max-height: 180px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #E5E7EB;
    }
    .sig-block svg {
      max-width: 100%;
      height: auto;
    }
    .footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #E5E7EB;
      font-size: 9px;
      color: #9BA1A6;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Run Sheet Summary</h1>
    <div class="subtitle">CargoNext Logistics — ${doc.name}</div>
  </div>

  <div class="summary-card">
    <div class="summary-grid">
      <div class="summary-item">
        <span class="label">Run Sheet</span>
        <span class="value">${doc.name}</span>
      </div>
      <div class="summary-item">
        <span class="label">Status</span>
        <span class="status-badge status-${(doc.status || "Draft").toLowerCase().replace(/\s+/g, "-")}">${doc.status}</span>
      </div>
      <div class="summary-item">
        <span class="label">Date</span>
        <span class="value">${formatDate(doc.run_date)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Run Type</span>
        <span class="value">${doc.run_type || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Route</span>
        <span class="value">${doc.route_name || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Vehicle</span>
        <span class="value">${doc.vehicle || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Driver</span>
        <span class="value">${doc.driver_name || doc.driver || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Company</span>
        <span class="value">${doc.transport_company || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Dispatch</span>
        <span class="value">${doc.dispatch_terminal || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Return</span>
        <span class="value">${doc.return_terminal || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Est. Dispatch</span>
        <span class="value">${doc.estimated_dispatch_datetime ? formatDate(doc.estimated_dispatch_datetime) : "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Est. Return</span>
        <span class="value">${doc.estimated_return_datetime ? formatDate(doc.estimated_return_datetime) : "—"}</span>
      </div>
    </div>
  </div>

  <div class="section-title">Transport Legs (${bundle.legs.length})</div>
  ${legHtmlParts.join("\n")}

  <div class="footer">
    Generated on ${generatedAt} — Powered by Agilasoft Cloud Technologies Inc.
  </div>
</body>
</html>`;
}

// ─── Main Export Functions ───────────────────────────────────

export async function generateRunSheetPdf(
  bundle: RunSheetBundle
): Promise<string> {
  const legHtmlParts: string[] = [];

  for (let i = 0; i < bundle.legs.length; i++) {
    const leg = bundle.legs[i];
    const pickSig = await getSignatureSvg(leg.name, "pick");
    const dropSig = await getSignatureSvg(leg.name, "drop");
    const pickPhoto = await getPhotoBase64(leg.name, "pick");
    const dropPhoto = await getPhotoBase64(leg.name, "drop");
    legHtmlParts.push(buildLegHtml(leg, i, pickSig, dropSig, pickPhoto, dropPhoto));
  }

  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = buildFullHtml(bundle, legHtmlParts, generatedAt);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  // Move to a persistent location with a descriptive filename
  const filename = `RunSheet_${bundle.doc.name.replace(/[^a-zA-Z0-9-]/g, "_")}_${Date.now()}.pdf`;
  const permanentUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.moveAsync({ from: uri, to: permanentUri });

  return permanentUri;
}

export async function generateAndSharePdf(
  bundle: RunSheetBundle
): Promise<void> {
  try {
    const uri = await generateRunSheetPdf(bundle);

    if (Platform.OS === "web") {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "PDF Generated",
          "Sharing is not available on web. The PDF has been generated locally."
        );
        return;
      }
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Run Sheet ${bundle.doc.name}`,
      UTI: "com.adobe.pdf",
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    throw error;
  }
}

export async function printRunSheetPdf(
  bundle: RunSheetBundle
): Promise<void> {
  const legHtmlParts: string[] = [];

  for (let i = 0; i < bundle.legs.length; i++) {
    const leg = bundle.legs[i];
    const pickSig = await getSignatureSvg(leg.name, "pick");
    const dropSig = await getSignatureSvg(leg.name, "drop");
    const pickPhoto = await getPhotoBase64(leg.name, "pick");
    const dropPhoto = await getPhotoBase64(leg.name, "drop");
    legHtmlParts.push(buildLegHtml(leg, i, pickSig, dropSig, pickPhoto, dropPhoto));
  }

  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = buildFullHtml(bundle, legHtmlParts, generatedAt);

  await Print.printAsync({ html });
}
