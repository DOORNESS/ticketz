import {
  ensurePilotToolsRegistered,
  isPilotToolsRegistered,
  resetPilotToolsRegistrationForTests
} from "../registerPilotTools";
import {
  getToolById,
  listTools,
  resetToolRegistryForTests
} from "../ToolRegistry";

describe("registerPilotTools", () => {
  beforeEach(() => {
    resetToolRegistryForTests();
    resetPilotToolsRegistrationForTests();
  });

  it("starts unregistered", () => {
    expect(isPilotToolsRegistered()).toBe(false);
  });

  it("registers tools synchronously on first ensure call", () => {
    ensurePilotToolsRegistered();

    expect(isPilotToolsRegistered()).toBe(true);
    expect(getToolById("get_ticket_status")?.definition.id).toBe(
      "get_ticket_status"
    );
    expect(listTools().length).toBeGreaterThanOrEqual(4);
  });

  it("registers only once without duplicates", () => {
    ensurePilotToolsRegistered();
    const firstCount = listTools().length;

    ensurePilotToolsRegistered();
    ensurePilotToolsRegistered();

    expect(listTools()).toHaveLength(firstCount);
    expect(
      listTools().filter(tool => tool.id === "get_ticket_status")
    ).toHaveLength(1);
  });

  it("supports concurrent ensure calls without duplicate registry entries", async () => {
    await Promise.all([
      Promise.resolve().then(() => ensurePilotToolsRegistered()),
      Promise.resolve().then(() => ensurePilotToolsRegistered()),
      Promise.resolve().then(() => ensurePilotToolsRegistered())
    ]);

    const ids = listTools().map(tool => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers before first tool lookup without deferred event loop", () => {
    expect(isPilotToolsRegistered()).toBe(false);

    const tool = getToolById("request_human_handoff");

    expect(tool?.definition.id).toBe("request_human_handoff");
    expect(isPilotToolsRegistered()).toBe(true);
  });
});
