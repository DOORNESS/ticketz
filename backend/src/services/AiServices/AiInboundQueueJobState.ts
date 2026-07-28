export const isRemovableDebounceJobState = (state: string): boolean =>
  ["completed", "failed", "delayed", "waiting"].includes(state);
