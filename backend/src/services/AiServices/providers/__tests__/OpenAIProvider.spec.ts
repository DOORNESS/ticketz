import { normalizeChatTemperature } from "../OpenAIProvider";

describe("normalizeChatTemperature", () => {
  it.each([
    [-0.7, 0.3],
    [Number.NaN, 0.3],
    [Number.POSITIVE_INFINITY, 0.3],
    [2.1, 0.3],
    [undefined, 0.3],
    [0, 0],
    [0.7, 0.7],
    [2, 2]
  ])("normalizes %p to %p", (input, expected) => {
    expect(normalizeChatTemperature(input)).toBe(expected);
  });
});
