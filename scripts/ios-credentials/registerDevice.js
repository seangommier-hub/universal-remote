// Registers an iPhone with the Apple Developer team by UDID via the App Store Connect API.
// Usage: node scripts/ios-credentials/registerDevice.js <UDID> "<Device Name>"
// Follow with regenerateProvisioningProfile.js so the new device lands in the ad-hoc profile.
const { ascApi } = require("./appStoreConnectApi");

async function registerDevice(udid, name) {
  const existing = await ascApi("GET", `/devices?filter[udid]=${encodeURIComponent(udid)}`);
  if (existing.data.length > 0) {
    console.log("Already registered:", existing.data[0].id, existing.data[0].attributes.status);
    return existing.data[0];
  }
  const created = await ascApi("POST", "/devices", {
    data: { type: "devices", attributes: { name, udid, platform: "IOS" } },
  });
  console.log("Registered:", created.data.id, created.data.attributes.status);
  return created.data;
}

module.exports = { registerDevice };

if (require.main === module) {
  const [udid, name] = process.argv.slice(2);
  if (!udid || !name) {
    console.error('Usage: node registerDevice.js <UDID> "<Device Name>"');
    process.exit(1);
  }
  registerDevice(udid, name).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
