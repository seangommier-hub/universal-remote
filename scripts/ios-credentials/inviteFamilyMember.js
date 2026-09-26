// Invites a family member to the App Store Connect team (needed for INTERNAL TestFlight testing,
// ADR-HEARTH-159), then adds them to the 'Family' beta group once they have accepted the invite.
// Usage: node scripts/ios-credentials/inviteFamilyMember.js <apple-id-email> "<First>" "<Last>"
// Run it twice: the first run sends the invitation email (to a third party: only run it with
// Sean's go-ahead); after the person accepts, the second run adds them to the group.
const { ascApi } = require("./appStoreConnectApi");

const APP_ID = "6813730400";
const GROUP_NAME = "Family";
// Lowest role that Apple allows as an internal tester; visibleApps limits what they can see.
const TESTER_ROLE = "MARKETING";

async function inviteToTeam(email, firstName, lastName) {
  const created = await ascApi("POST", "/userInvitations", {
    data: {
      type: "userInvitations",
      attributes: {
        email,
        firstName,
        lastName,
        roles: [TESTER_ROLE],
        allAppsVisible: false,
      },
      relationships: { visibleApps: { data: [{ type: "apps", id: APP_ID }] } },
    },
  });
  console.log("Invitation sent:", created.data.id, "- ask them to accept the email from Apple.");
}

async function addAcceptedUserToGroup(email) {
  const groups = await ascApi("GET", `/apps/${APP_ID}/betaGroups`);
  const group = groups.data.find((g) => g.attributes.name === GROUP_NAME);
  if (!group) throw new Error(`Beta group '${GROUP_NAME}' not found; run setupFamilyTestFlight.js`);
  const users = await ascApi("GET", `/users?filter[username]=${encodeURIComponent(email)}`);
  if (users.data.length === 0) return false;
  const found = await ascApi("GET", `/betaTesters?filter[email]=${encodeURIComponent(email)}`);
  const tester = found.data[0] || (await createTester(email, users.data[0], group.id));
  await ascApi("POST", `/betaGroups/${group.id}/relationships/betaTesters`, {
    data: [{ type: "betaTesters", id: tester.id }],
  });
  console.log("Added to group", GROUP_NAME + ":", email);
  return true;
}

async function createTester(email, user, groupId) {
  const { firstName, lastName } = user.attributes;
  const created = await ascApi("POST", "/betaTesters", {
    data: {
      type: "betaTesters",
      attributes: { email, firstName, lastName },
      relationships: { betaGroups: { data: [{ type: "betaGroups", id: groupId }] } },
    },
  });
  return created.data;
}

async function main() {
  const [email, firstName, lastName] = process.argv.slice(2);
  if (!email || !firstName || !lastName) {
    console.error('Usage: node inviteFamilyMember.js <apple-id-email> "<First>" "<Last>"');
    process.exit(1);
  }
  if (await addAcceptedUserToGroup(email)) return;
  const pending = await ascApi("GET", `/userInvitations?filter[email]=${encodeURIComponent(email)}`);
  if (pending.data.length > 0) {
    console.log("Invitation already pending; rerun after they accept.");
    return;
  }
  await inviteToTeam(email, firstName, lastName);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
