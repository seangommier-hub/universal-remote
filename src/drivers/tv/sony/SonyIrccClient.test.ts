import { SONY_IRCC_CODES, SonyIrccClient } from "./SonyIrccClient";

describe("SonyIrccClient", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("posts the real X_SendIRCC SOAP envelope to /sony/ircc with the PSK and SOAPAction headers", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const client = new SonyIrccClient({ ipAddress: "192.168.1.50", psk: "secret-psk" });

    await client.sendCode(SONY_IRCC_CODES.confirm);

    expect(global.fetch).toHaveBeenCalledWith(
      "http://192.168.1.50:80/sony/ircc",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Auth-PSK": "secret-psk",
          "Content-Type": "text/xml; charset=UTF-8",
          SOAPAction: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        }),
      })
    );
    const call = (global.fetch as jest.Mock).mock.calls[0];
    const body = call[1].body as string;
    expect(body).toContain("<IRCCCode>AAAAAQAAAAEAAABlAw==</IRCCCode>");
    expect(body).toContain('<u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">');
  });

  test("throws on a non-OK HTTP response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    const client = new SonyIrccClient({ ipAddress: "192.168.1.50", psk: "bad" });

    await expect(client.sendCode(SONY_IRCC_CODES.up)).rejects.toThrow("HTTP 403");
  });

  // Real-hardware research (2026-09-16, ADR-HEARTH-071): these exact values are corroborated
  // byte-for-byte across two independent sources (a real device dump and a maintained community
  // client's own code table) — see SonyIrccClient.ts's own doc comment for both URLs. A change to
  // any of these should be treated as a real regression, not just a snapshot to update blindly.
  test("SONY_IRCC_CODES match both corroborating real sources exactly", () => {
    expect(SONY_IRCC_CODES).toEqual({
      up: "AAAAAQAAAAEAAAB0Aw==",
      down: "AAAAAQAAAAEAAAB1Aw==",
      left: "AAAAAQAAAAEAAAA0Aw==",
      right: "AAAAAQAAAAEAAAAzAw==",
      confirm: "AAAAAQAAAAEAAABlAw==",
      home: "AAAAAQAAAAEAAABgAw==",
      return: "AAAAAgAAAJcAAAAjAw==",
    });
  });
});
