export const waitForInboundBufferQuietPeriod = async (
  readBufferSize: () => Promise<number>,
  quietMs: number,
  pollMs = 100
): Promise<void> => {
  let lastSize = await readBufferSize();
  if (lastSize === 0) {
    return;
  }

  let lastChangeAt = Date.now();

  while (Date.now() - lastChangeAt < quietMs) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    const size = await readBufferSize();
    if (size !== lastSize) {
      lastSize = size;
      lastChangeAt = Date.now();
    }
  }
};
