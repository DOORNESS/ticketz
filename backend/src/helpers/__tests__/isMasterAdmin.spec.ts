import { getMasterAdminEmails, isMasterAdminUser } from "../isMasterAdmin";

describe("isMasterAdmin", () => {
  it("recognizes configured master email", () => {
    expect(getMasterAdminEmails()).toContain("fernandofortmax@gmail.com");
    expect(
      isMasterAdminUser({
        email: "fernandofortmax@gmail.com",
        profile: "user",
        super: false
      })
    ).toBe(true);
  });

  it("recognizes admin and super profiles", () => {
    expect(isMasterAdminUser({ profile: "admin", super: false })).toBe(true);
    expect(isMasterAdminUser({ profile: "user", super: true })).toBe(true);
  });

  it("rejects regular users", () => {
    expect(
      isMasterAdminUser({
        email: "agent@example.com",
        profile: "user",
        super: false
      })
    ).toBe(false);
  });
});
