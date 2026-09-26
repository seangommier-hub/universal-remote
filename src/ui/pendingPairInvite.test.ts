import { offerPendingPairInvite, subscribeToPairInvites, takePendingPairInvite } from "./pendingPairInvite";

const INVITE = { code: "ABCD1234", server: "https://hearth-relay.carddna.app" };

describe("pendingPairInvite", () => {
  test("holds a cold-start link until the Devices tab takes it, once", () => {
    offerPendingPairInvite(INVITE);
    expect(takePendingPairInvite()).toEqual(INVITE);
    expect(takePendingPairInvite()).toBeNull();
  });

  test("tells a mounted subscriber about a warm-start link and stops after unsubscribe", () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeToPairInvites((invite) => seen.push(invite));
    offerPendingPairInvite(INVITE);
    unsubscribe();
    offerPendingPairInvite({ code: "ZZZZ9999" });
    expect(seen).toEqual([INVITE]);
    takePendingPairInvite();
  });
});
