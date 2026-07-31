import {
  removeOptimisticMessage,
  replaceOptimisticMessage
} from "./optimisticMessages";

describe("optimistic message reconciliation", () => {
  it("replaces the temporary message with the server confirmation", () => {
    const pending = { id: "optimistic-1", body: "Olá", optimistic: true };
    const confirmed = { id: "server-1", body: "Olá", ack: 1 };

    expect(replaceOptimisticMessage([pending], pending.id, confirmed)).toEqual([
      confirmed
    ]);
  });

  it("deduplicates when the socket confirmation arrived first", () => {
    const pending = { id: "optimistic-1", body: "Olá", optimistic: true };
    const socketMessage = { id: "server-1", body: "Olá", ack: 1 };
    const httpMessage = { id: "server-1", body: "Olá", ack: 2 };

    expect(
      replaceOptimisticMessage(
        [pending, socketMessage],
        pending.id,
        httpMessage
      )
    ).toEqual([httpMessage]);
  });

  it("removes only the failed temporary message", () => {
    const pending = { id: "optimistic-1" };
    const nextMessage = { id: "optimistic-2" };

    expect(removeOptimisticMessage([pending, nextMessage], pending.id)).toEqual(
      [nextMessage]
    );
  });
});
