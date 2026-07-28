import { isRemovableDebounceJobState } from "../AiInboundQueueJobState";

describe("AI inbound queue debounce job lifecycle", () => {
  it.each(["completed", "failed", "delayed", "waiting"])(
    "replaces a %s job so the next customer message is processed",
    state => {
      expect(isRemovableDebounceJobState(state)).toBe(true);
    }
  );

  it("does not remove the job that is currently processing", () => {
    expect(isRemovableDebounceJobState("active")).toBe(false);
  });
});
