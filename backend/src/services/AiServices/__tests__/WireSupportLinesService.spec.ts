import {
  findByNameLoose,
  FORTMAX_PROMPT,
  NIVEL_PROMPT
} from "../WireSupportLinesService";

const mockFindOne = jest.fn();

jest.mock("../../../models/KnowledgeDomain", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => mockFindOne(...args) }
}));

describe("WireSupportLinesService helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("findByNameLoose returns the first matching pattern", async () => {
    mockFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 7, name: "Suporte Nível", update: jest.fn() });

    const match = await findByNameLoose(
      { findOne: mockFindOne, create: jest.fn() },
      1,
      ["suporte nivel", "suporte nível"]
    );

    expect(match?.id).toBe(7);
    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });

  it("keeps Fortmax and Nivel prompts distinct", () => {
    expect(FORTMAX_PROMPT).toContain("Webin");
    expect(NIVEL_PROMPT).toContain("Nivelton");
    expect(FORTMAX_PROMPT).not.toContain("Nivelton");
    expect(NIVEL_PROMPT).not.toMatch(/Você é o Webin/i);
  });
});
