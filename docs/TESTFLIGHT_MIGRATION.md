# Moving an ad hoc phone to the TestFlight build

The ad hoc app (`com.hearthremote.app`) and the TestFlight app (`com.seangommier.hearthapp`) are two separate apps with separate storage, so devices and the connection do not carry over. Do the steps in this order on each phone (Sean's and Leah's).

Before you start: on the OLD app, open Devices, tap Share mine (sends the device list to the household store). Keep the old app installed until the new one works.

1. Install Apple's TestFlight app from the App Store and open the emailed invite (or the TestFlight invitation in the app), then tap Install on Hearth.
2. Open the new Hearth. Approve the Local Network prompt.
3. Reconnect to Family Command Center:
   - On a phone that is already connected, open Family Command Center settings and use Invite someone to show an 8-character code (or share the link).
   - On the new install, tap Join with a code on the first-run screen (or open the shared `hearth://pair` link) and enter the code. Codes are short-lived.
4. Open Devices and tap Load shared to bring the device list across. Automatic household sync also fills it in.
5. Test one device from the new app. Then delete the old ad hoc Hearth.

Sean's phone is already connected, so it can generate the code for Leah's phone; Sean's own new install needs a code from a second connected phone, or its FCC settings entered by hand once.
