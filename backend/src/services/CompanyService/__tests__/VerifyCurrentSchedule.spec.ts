import VerifyCurrentSchedule from "../VerifyCurrentSchedule";
import Queue from "../../../models/Queue";
import Company from "../../../models/Company";

jest.mock("../../../database", () => ({
  __esModule: true,
  default: {
    query: jest.fn()
  }
}));

jest.mock("../../../models/Queue");
jest.mock("../../../models/Company");

const mockedQueue = Queue as jest.Mocked<typeof Queue>;
const mockedCompany = Company as jest.Mocked<typeof Company>;

describe("VerifyCurrentSchedule", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns open when queue schedules is an empty object", async () => {
    mockedQueue.findOne.mockResolvedValue({
      schedules: {}
    } as unknown as Queue);

    const result = await VerifyCurrentSchedule(1, 6);

    expect(result).toEqual({ inActivity: true });
  });

  it("returns open when queue schedules is an empty array", async () => {
    mockedQueue.findOne.mockResolvedValue({
      schedules: []
    } as unknown as Queue);

    const result = await VerifyCurrentSchedule(1, 6);

    expect(result).toEqual({ inActivity: true });
  });

  it("returns open when company schedules is missing", async () => {
    mockedCompany.findOne.mockResolvedValue(null);

    const result = await VerifyCurrentSchedule(1);

    expect(result).toEqual({ inActivity: true });
  });
});
