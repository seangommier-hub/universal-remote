// Fixed OAuth configuration for Home Assistant sign-in (ADR-HEARTH-190).

// The static page hosted by the Family Command Center Pi that identifies Hearth to Home Assistant.
// Home Assistant's auth API normally requires redirect_uri to share client_id's host/port, but lets
// the client_id page declare a different one via <link rel="redirect_uri">, which is how a native
// app's custom scheme is supported (developers.home-assistant.io/docs/auth_api, fetched 2026-09-27).
export const HA_OAUTH_CLIENT_ID_URL = "https://hearth-relay.carddna.app/hearth/ha-client";

// Hearth's own custom URL scheme (app.config.js `scheme: "hearth"`) plus a path dedicated to this
// flow, distinct from the existing hearth://pair invite links (usePairLinkListener.ts).
export const HA_OAUTH_REDIRECT_URI = "hearth://ha-auth";

// Home Assistant access tokens last 1800s (30 min, per the auth API docs fetched 2026-09-27);
// refreshing at 80% of that lifetime leaves margin for a slow network call before it actually expires.
export const HA_OAUTH_PROACTIVE_REFRESH_FRACTION = 0.8;
