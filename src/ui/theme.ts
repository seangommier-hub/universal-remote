/**
 * Hearth design tokens, matching the logo palette (ADR-HEARTH-002). Centralized so no screen
 * hardcodes a hex value, a spacing number, or a font size. Extended per ADR-HEARTH-009 (UI
 * design pass) with a tonal elevation ladder, status colors, and spacing/radius/type scales —
 * the base navy+ember identity colors are unchanged from ADR-HEARTH-002.
 */
export const theme = {
  background: "#12141C",
  // Tonal elevation ladder (Material 3 pattern: higher surfaces step up in luminance rather
  // than relying on drop shadows alone, which read poorly on OLED-dark navy backgrounds).
  surface: "#1B2030",
  surfaceRaised: "#242B3D",
  surfaceOverlay: "#2D3550",

  accentStart: "#FFC773",
  accentEnd: "#FF7A45",
  accentSoft: "#FF7A4526", // accentEnd at ~15% opacity, for tinted icon backgrounds/badges

  textPrimary: "#F5F1EA",
  textSecondary: "#9099AC",
  textTertiary: "#5C6480",

  border: "#2E3549",
  borderSubtle: "#242A3B",

  // Status colors — used for connection/power state indicators, never for brand identity.
  statusOn: "#5FD98A",
  statusOnSoft: "#5FD98A22",
  statusOff: "#5C6480",
  statusError: "#FF6B6B",
  statusErrorSoft: "#FF6B6B1F",

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 999,
  },

  type: {
    display: 32,
    title: 24,
    subtitle: 17,
    body: 15,
    label: 13,
    caption: 12,
  },
} as const;
