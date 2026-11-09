export const VISITOR_EVENT_TYPES = [
  "page_view",
  "section_view",
  "referral_click",
  "image_view",
  "image_download",
] as const;

export type VisitorEventType = (typeof VISITOR_EVENT_TYPES)[number];
export type DeviceKind = "desktop" | "mobile" | "tablet" | "bot" | "other";
export type GeoStatus = "pending" | "ready" | "unavailable" | "disabled" | "local" | "error";

/** City-level IP estimate. This is never a request for the device's GPS position. */
export type VisitorGeo = {
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  network: string | null;
  asn: string | null;
};

export type Visit = VisitorGeo & {
  id: string;
  startedAt: number;
  lastSeenAt: number;
  activeSeconds: number;
  ip: string;
  lastIp: string;
  userAgent: string;
  deviceType: DeviceKind;
  deviceVendor: string | null;
  deviceModel: string | null;
  browser: string;
  browserVersion: string | null;
  os: string;
  osVersion: string | null;
  landingPath: string;
  referrer: string | null;
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  language: string | null;
  timezone: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  geoStatus: GeoStatus;
  geoUpdatedAt: number | null;
  demo: boolean;
};

export type VisitorEvent = {
  id: string;
  type: VisitorEventType;
  target: string | null;
  path: string | null;
  occurredAt: number;
  receivedAt: number;
};

export type BreakdownItem = { label: string; count: number };
export type VisitorSummary = {
  visits: number;
  uniqueIps: number;
  activeNow: number;
  averageActiveSeconds: number;
  mobileShare: number;
  countries: BreakdownItem[];
  devices: BreakdownItem[];
  browsers: BreakdownItem[];
  sources: BreakdownItem[];
};

export type VisitorLogResponse = {
  visits: Visit[];
  total: number;
  limit: number;
  offset: number;
  summary: VisitorSummary;
  retentionDays: number;
  geoEnabled: boolean;
  geoProvider: string;
  demo: boolean;
  capacityReached: boolean;
  generatedAt: number;
};

export type PublicTrackingConfig = {
  enabled: boolean;
  retentionDays: number;
  geoEnabled: boolean;
  geoProvider: string;
  privacyController: string;
  privacyContact: string;
  noticeVersion: string;
  demo: boolean;
};
