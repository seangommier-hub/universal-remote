import { AppState, AppStateStatus } from "react-native";
import { HaInstance } from "./haInstance";
import { onHaInstanceTokenChanged } from "./haInstanceRegistry";
import { HaSession } from "./haSession";
import { HaSocketFactory } from "./haSocket";

interface HubEntry {
  session: HaSession;
  token: string;
  /** How many devices are following this session; the socket closes when the last one leaves. */
  users: number;
}

// One session per instance, shared by every device on it (ADR-HEARTH-175).
const entries = new Map<string, HubEntry>();
let socketFactory: HaSocketFactory | undefined;
let lifecycleAttached = false;
let inBackground = false;

/** The one shared session for an instance (created on first use, not started). A changed token replaces the session. */
export function sessionFor(instance: HaInstance): HaSession {
  attachLifecycleOnce();
  const existing = entries.get(instance.id);
  if (existing) {
    if (existing.token !== instance.token) replaceToken(existing, instance.token);
    return existing.session;
  }
  const session = new HaSession({ baseUrl: instance.baseUrl, token: instance.token, createSocket: socketFactory });
  entries.set(instance.id, { session, token: instance.token, users: 0 });
  return session;
}

function replaceToken(entry: HubEntry, token: string): void {
  entry.token = token;
  entry.session.replaceToken(token);
  if (inBackground) entry.session.stop();
}

/** Joins the instance's session (one more follower) and starts it unless the app is in the background (it resumes on foreground). */
export function startSession(instance: HaInstance): HaSession {
  const session = sessionFor(instance);
  const entry = entries.get(instance.id);
  if (entry) entry.users += 1;
  if (!inBackground) session.start();
  return session;
}

/** Leaves the instance's session; the socket and its timers are closed when nobody follows it any more. */
export function releaseSession(instance: HaInstance): void {
  const entry = entries.get(instance.id);
  if (!entry) return;
  entry.users = Math.max(0, entry.users - 1);
  if (entry.users === 0) entry.session.stop();
}

/** Closes sockets when the app goes to the background and reopens the ones that were in use when it returns. */
export function handleAppStateChange(state: AppStateStatus): void {
  inBackground = state !== "active";
  entries.forEach((entry) => {
    if (inBackground) entry.session.stop();
    else if (entry.users > 0) entry.session.start();
  });
}

function attachLifecycleOnce(): void {
  if (lifecycleAttached) return;
  lifecycleAttached = true;
  AppState.addEventListener("change", handleAppStateChange);
  onHaInstanceTokenChanged((instance) => sessionFor(instance));
}

/** Test-only: replaces the WebSocket used by new sessions and forgets every session. */
export function resetHubForTests(factory?: HaSocketFactory): void {
  entries.forEach((entry) => entry.session.stop());
  entries.clear();
  socketFactory = factory;
  inBackground = false;
}
