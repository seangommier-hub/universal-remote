# ADR-HEARTH-001: Project location, name, and initial stack

**Date:** 2026-09-08
**Status:** Accepted

## Context

Sean requested a new, large, cross-platform Universal Remote + Smart Home
Control application ("the Project brief"). The brief itself states this is a
standalone product effort with its own long-term roadmap, and Sean confirmed
mid-session that "this needs to be its own project" (not folded into an
existing one).

Per global instructions (`CLAUDE.md`), new standalone engineering projects
belong under `C:\Users\SeanGommier\Projects\AI Engineering Workspace\projects\`.

## Decision

- Repo/folder name: `universal-remote` (technical/internal identifier).
- Product/brand name: **Hearth** (see ADR-HEARTH-002).
- Framework: Expo (React Native) with the `blank-typescript` template,
  Expo SDK 57, React 19 / React Native 0.86.
- Package manager: npm (matches the rest of the workspace's Node projects).
- Primary early test target: Expo Go on iPhone, per the brief's explicit
  "INITIAL DEVELOPMENT AND TESTING PRIORITY" section.

## Rationale

- Expo is the framework the brief explicitly mandates ("prefer an
  Expo-compatible architecture," "Expo Go on iPhone" as the baseline).
- TypeScript is required implicitly by the coding standards in `CLAUDE.md`
  (self-documenting code, no magic values, testability) and is standard for
  a project of this scope.
- Keeping the folder name distinct from the product name avoids a disruptive
  mid-session directory rename while still giving the product a real
  identity for docs, app store listings, and branding.

## Consequences

- All future ADRs, docs, and driver code for this product live under
  `projects/universal-remote/`.
- `app.json` / `package.json` use "Hearth" / "hearth" as the user-facing and
  package identifiers; the bundle IDs (`com.hearth.app`) are placeholders
  and MUST be replaced with a real reverse-DNS identifier Sean controls
  before any App Store / Play Store submission.
