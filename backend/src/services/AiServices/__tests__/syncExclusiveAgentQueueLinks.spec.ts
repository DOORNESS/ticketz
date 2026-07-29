import { Op } from "sequelize";
import { syncExclusiveAgentQueueLinks } from "../syncExclusiveAgentQueueLinks";

const mockDestroy = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();

jest.mock("../../../models/AiAgentQueue", () => ({
  __esModule: true,
  default: {
    destroy: (...args: unknown[]) => mockDestroy(...args),
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: (...args: unknown[]) => mockCreate(...args)
  }
}));

describe("syncExclusiveAgentQueueLinks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(0);
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
  });

  it("removes every queue link when the agent is unassigned", async () => {
    await syncExclusiveAgentQueueLinks({
      companyId: 1,
      aiAgentId: 10,
      queueLinks: []
    });

    expect(mockDestroy).toHaveBeenCalledWith({
      where: { companyId: 1, aiAgentId: 10 }
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("removes stale agent links and competing links on the target queue", async () => {
    await syncExclusiveAgentQueueLinks({
      companyId: 1,
      aiAgentId: 10,
      queueLinks: [{ queueId: 2, knowledgeBaseId: 30 }]
    });

    expect(mockDestroy).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        aiAgentId: 10,
        queueId: { [Op.notIn]: [2] }
      }
    });
    expect(mockDestroy).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        queueId: { [Op.in]: [2] },
        aiAgentId: { [Op.ne]: 10 }
      }
    });
    expect(mockCreate).toHaveBeenCalledWith({
      companyId: 1,
      aiAgentId: 10,
      queueId: 2,
      knowledgeBaseId: 30
    });
  });
});
