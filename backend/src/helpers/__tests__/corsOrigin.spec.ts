import { corsOrigin } from "../corsOrigin";

const checkOrigin = (origin?: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    corsOrigin(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(allowed));
    });
  });

describe("corsOrigin", () => {
  const originalBackendUrl = process.env.BACKEND_URL;

  afterEach(() => {
    process.env.BACKEND_URL = originalBackendUrl;
  });

  it("allows the backend's own origin for public HTML forms", async () => {
    process.env.BACKEND_URL = "https://api.example.com/";

    await expect(checkOrigin("https://api.example.com")).resolves.toBe(true);
  });

  it("allows the production escalation form origin", async () => {
    await expect(checkOrigin("https://api.fortmax.com.br")).resolves.toBe(true);
  });

  it("rejects an unrelated origin", async () => {
    await expect(checkOrigin("https://malicious.example")).rejects.toThrow(
      "not allowed by CORS"
    );
  });
});
