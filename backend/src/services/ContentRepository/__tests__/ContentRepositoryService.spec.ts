import ContentRepositoryItem from "../../../models/ContentRepositoryItem";
import {
  canAccessRepositoryItem,
  assertRepositoryFileAllowed
} from "../ContentRepositoryService";

describe("ContentRepositoryService", () => {
  const baseItem = {
    companyId: 1,
    active: true,
    archivedAt: null,
    allowHumanUse: true,
    allowAiUse: true,
    useForDelivery: true,
    queueIds: [],
    agentIds: [],
    aiAgentIds: []
  } as ContentRepositoryItem;

  it("allows admin access across queues", () => {
    expect(
      canAccessRepositoryItem(
        { ...baseItem, queueIds: [99] } as ContentRepositoryItem,
        {
          userId: 5,
          profile: "admin",
          companyId: 1,
          queueIds: [1]
        }
      )
    ).toBe(true);
  });

  it("blocks cross-company access", () => {
    expect(
      canAccessRepositoryItem(baseItem, {
        userId: 5,
        profile: "admin",
        companyId: 2
      })
    ).toBe(false);
  });

  it("blocks inactive items", () => {
    expect(
      canAccessRepositoryItem(
        { ...baseItem, active: false } as ContentRepositoryItem,
        {
          userId: 5,
          profile: "admin",
          companyId: 1
        }
      )
    ).toBe(false);
  });

  it("blocks AI usage when allowAiUse is false", () => {
    expect(
      canAccessRepositoryItem(
        { ...baseItem, allowAiUse: false } as ContentRepositoryItem,
        {
          userId: 0,
          profile: "admin",
          companyId: 1,
          forAi: true
        }
      )
    ).toBe(false);
  });

  it("rejects blocked executable extensions", () => {
    expect(() =>
      assertRepositoryFileAllowed("virus.exe", "application/octet-stream", 1000)
    ).toThrow("ERR_REPOSITORY_FILE_BLOCKED");
  });
});
