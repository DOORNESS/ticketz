import {
  createEscalationToken,
  verifyEscalationToken
} from "../EscalationEmailTokenService";

describe("EscalationEmailTokenService", () => {
  const originalSecret = process.env.SEND_EMAIL_HOOK_SECRET;

  beforeEach(() => {
    process.env.SEND_EMAIL_HOOK_SECRET = "test-hook-secret";
  });

  afterEach(() => {
    process.env.SEND_EMAIL_HOOK_SECRET = originalSecret;
  });

  it("creates and verifies a signed escalation token", () => {
    const token = createEscalationToken({
      escalationId: 12,
      ticketId: 34,
      companyId: 1
    });

    const payload = verifyEscalationToken(token);
    expect(payload).toMatchObject({
      eid: 12,
      tid: 34,
      cid: 1
    });
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects tampered tokens", () => {
    const token = createEscalationToken({
      escalationId: 1,
      ticketId: 2,
      companyId: 3
    });
    const tampered = `${token}x`;

    expect(() => verifyEscalationToken(tampered)).toThrow(
      "ERR_ESCALATION_TOKEN_INVALID"
    );
  });
});
