// Recreates the Hearth ad-hoc provisioning profile to cover every currently-enabled Apple device,
// using the distribution certificate this project already holds the private key for (ios-credentials/).
// Run this after registering a new device (`eas device:create`) so it gets added to the profile,
// then re-run an EAS build — see ADR-HEARTH-081 for why this exists instead of EAS-managed
// "remote" credentials.
const fs = require("fs");
const path = require("path");
const { ascApi } = require("./appStoreConnectApi");

const BUNDLE_ID_RESOURCE_ID = "WAD53WSTHY"; // com.hearthremote.app
const CREDENTIALS_DIR = path.join(__dirname, "..", "..", "ios-credentials");

async function regenerateProvisioningProfile() {
  const certId = fs.readFileSync(path.join(CREDENTIALS_DIR, "cert-id.txt"), "utf8").trim();

  const devicesJson = await ascApi("GET", "/devices?filter[status]=ENABLED");
  const deviceIds = devicesJson.data.map((d) => d.id);
  console.log(
    "Including devices:",
    devicesJson.data.map((d) => `${d.attributes.name} (${d.attributes.udid})`)
  );

  const oldProfileIdPath = path.join(CREDENTIALS_DIR, "profile-id.txt");
  if (fs.existsSync(oldProfileIdPath)) {
    const oldProfileId = fs.readFileSync(oldProfileIdPath, "utf8").trim();
    try {
      await ascApi("DELETE", `/profiles/${oldProfileId}`);
      console.log("Deleted old profile", oldProfileId);
    } catch (err) {
      console.warn("Could not delete old profile (continuing anyway):", err.message);
    }
  }

  const profileName = `Hearth Remote Ad Hoc ${new Date().toISOString().slice(0, 16)}`;
  const created = await ascApi("POST", "/profiles", {
    data: {
      type: "profiles",
      attributes: { name: profileName, profileType: "IOS_APP_ADHOC" },
      relationships: {
        bundleId: { data: { id: BUNDLE_ID_RESOURCE_ID, type: "bundleIds" } },
        certificates: { data: [{ id: certId, type: "certificates" }] },
        devices: { data: deviceIds.map((id) => ({ id, type: "devices" })) },
      },
    },
  });

  console.log("Created profile id:", created.data.id, "state:", created.data.attributes.profileState);
  fs.writeFileSync(
    path.join(CREDENTIALS_DIR, "hearth.mobileprovision"),
    Buffer.from(created.data.attributes.profileContent, "base64")
  );
  fs.writeFileSync(path.join(CREDENTIALS_DIR, "profile-id.txt"), created.data.id);
}

module.exports = { regenerateProvisioningProfile };

if (require.main === module) {
  regenerateProvisioningProfile().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
