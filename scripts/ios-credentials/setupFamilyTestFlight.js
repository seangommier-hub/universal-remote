// Idempotently sets up the internal 'Family' TestFlight group for Hearth (ADR-HEARTH-159):
// group with automatic distribution (hasAccessToAllBuilds), beta test info, and the account
// holder as a tester. Usage: node scripts/ios-credentials/setupFamilyTestFlight.js
const { ascApi } = require("./appStoreConnectApi");

const APP_ID = "6813730400";
const GROUP_NAME = "Family";
const CONTACT_EMAIL = "seangommier@gmail.com";
const ACCOUNT_HOLDER_ROLE = "ACCOUNT_HOLDER";
const TEST_INFO = {
  locale: "en-US",
  description:
    "Hearth is a universal remote for the household: TVs, streaming boxes, outlets and smart-home devices on your home network.",
  feedbackEmail: CONTACT_EMAIL,
};

async function ensureGroup() {
  const groups = await ascApi("GET", `/apps/${APP_ID}/betaGroups`);
  const existing = groups.data.find((g) => g.attributes.name === GROUP_NAME);
  if (existing) return existing;
  const created = await ascApi("POST", "/betaGroups", {
    data: {
      type: "betaGroups",
      attributes: { name: GROUP_NAME, isInternalGroup: true, hasAccessToAllBuilds: true },
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
  return created.data;
}

async function ensureBetaTestInfo() {
  const locs = await ascApi("GET", `/apps/${APP_ID}/betaAppLocalizations`);
  if (locs.data.some((l) => l.attributes.locale === TEST_INFO.locale)) return;
  await ascApi("POST", "/betaAppLocalizations", {
    data: {
      type: "betaAppLocalizations",
      attributes: TEST_INFO,
      relationships: { app: { data: { type: "apps", id: APP_ID } } },
    },
  });
}

async function findAccountHolder() {
  const users = await ascApi("GET", "/users");
  const holder = users.data.find((u) => u.attributes.roles.includes(ACCOUNT_HOLDER_ROLE));
  if (!holder) throw new Error("No account holder user found");
  return holder;
}

async function ensureTester(groupId, holder) {
  const { username, firstName, lastName } = holder.attributes;
  const found = await ascApi("GET", `/betaTesters?filter[email]=${encodeURIComponent(username)}`);
  if (found.data.length > 0) {
    await ascApi("POST", `/betaGroups/${groupId}/relationships/betaTesters`, {
      data: [{ type: "betaTesters", id: found.data[0].id }],
    });
    return;
  }
  await ascApi("POST", "/betaTesters", {
    data: {
      type: "betaTesters",
      attributes: { email: username, firstName, lastName },
      relationships: { betaGroups: { data: [{ type: "betaGroups", id: groupId }] } },
    },
  });
}

async function main() {
  const group = await ensureGroup();
  console.log("Group:", group.id, JSON.stringify(group.attributes));
  await ensureBetaTestInfo();
  await ensureTester(group.id, await findAccountHolder());
  const testers = await ascApi("GET", `/betaGroups/${group.id}/betaTesters`);
  console.log("Testers in group:", testers.data.length);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
