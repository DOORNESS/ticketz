type ConversationItem = {
  role: "user" | "assistant";
  content: string;
};

export const buildContextualRetrievalQuery = (
  userText: string,
  history: ConversationItem[],
  maxChars = 1800
): string => {
  const customerTurns = history
    .filter(item => item.role === "user" && item.content.trim())
    .map(item => item.content.trim())
    .slice(-3);
  const current = userText.trim();

  if (current && customerTurns[customerTurns.length - 1] !== current) {
    customerTurns.push(current);
  }

  return customerTurns.join("\n").slice(-maxChars).trim();
};
