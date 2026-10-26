/** Launches one of the fixed streaming services on a Sony BRAVIA through its REST appControl service (ADR-HEARTH-234). */

import { StreamingService } from "../../../core/types/Capability";
import { CommandValidationError } from "../../shared/commandFailure";
import { SonyBraviaClient } from "./SonyBraviaClient";

interface SonyApplication {
  title?: string;
  uri?: string;
}

// Matched against each installed app's title, case-insensitively. Sony app uris differ by model and
// region, so the uri is always read off the TV (appControl.getApplicationList) rather than hardcoded.
const SERVICE_TITLE_PATTERNS: Record<StreamingService, RegExp> = {
  netflix: /^netflix$/i,
  youtube: /^youtube$/i,
  primeVideo: /prime video/i,
  hulu: /^hulu$/i,
};

/** Finds the installed app for `service` and makes it the active app; throws a validation error when it isn't installed. */
export async function launchSonyApp(client: SonyBraviaClient, service: StreamingService | undefined): Promise<void> {
  const pattern = service ? SERVICE_TITLE_PATTERNS[service] : undefined;
  if (!pattern) throw new CommandValidationError(`launchApp requires a supported 'service' arg (got ${String(service)})`);
  // appControl v1.0: getApplicationList -> [[{title, uri, icon, data}]]; setActiveApp([{uri}]).
  const [applications] = await client.call<SonyApplication[][]>("appControl", "getApplicationList");
  const app = (applications ?? []).find((candidate) => typeof candidate.title === "string" && pattern.test(candidate.title.trim()));
  if (!app?.uri) throw new CommandValidationError(`${service} isn't installed on this Sony TV`);
  await client.call("appControl", "setActiveApp", [{ uri: app.uri }]);
}
