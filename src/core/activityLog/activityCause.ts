// ADR-HEARTH-176: why a logged command happened. The Pi's log schema is strict (adr/0199), so the cause is
// encoded in the existing `who` text instead of a new field, and read back from it for display.

export type ActivityCause = "person" | "activity" | "kid-mode" | "schedule" | "home-assistant";

/** What a command was sent by, when it was not simply the phone's owner pressing a button. */
export type CommandCause =
  | { kind: "activity"; name: string }
  | { kind: "kid-mode"; phoneName: string }
  | { kind: "schedule"; name?: string }
  | { kind: "home-assistant" };

const KID_MODE_LABEL = "Kid mode";
const KID_MODE_SUFFIX = " (kid mode)";
const ACTIVITY_SUFFIX = " (Activity)";
const SCHEDULE_LABEL = "Schedule";
const SCHEDULE_SUFFIX = " (schedule)";
const HOME_ASSISTANT_LABEL = "Home Assistant";
const UNNAMED_ACTIVITY = "An Activity";

/** The text shown before the verb: "Movie night (Activity)", "Kid mode", "Leah's iPhone (kid mode)", "Schedule", "Home Assistant". */
export function whoForCause(cause: CommandCause): string {
  switch (cause.kind) {
    case "activity":
      return `${cause.name.trim() || UNNAMED_ACTIVITY}${ACTIVITY_SUFFIX}`;
    case "kid-mode":
      return cause.phoneName.trim() ? `${cause.phoneName.trim()}${KID_MODE_SUFFIX}` : KID_MODE_LABEL;
    case "schedule":
      return cause.name?.trim() ? `${cause.name.trim()}${SCHEDULE_SUFFIX}` : SCHEDULE_LABEL;
    case "home-assistant":
      return HOME_ASSISTANT_LABEL;
  }
}

/** Works out the cause of an entry from its `who` text; entries written before this ADR are all "person". */
export function causeOfWho(who: string): ActivityCause {
  if (who === KID_MODE_LABEL || who.endsWith(KID_MODE_SUFFIX)) return "kid-mode";
  if (who.endsWith(ACTIVITY_SUFFIX)) return "activity";
  if (who === SCHEDULE_LABEL || who.endsWith(SCHEDULE_SUFFIX)) return "schedule";
  if (who === HOME_ASSISTANT_LABEL) return "home-assistant";
  return "person";
}
