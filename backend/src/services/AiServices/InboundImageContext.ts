export const INBOUND_IMAGE_CONTEXT_PATTERN =
  /\[Imagem enviada pelo cliente(?: — [^\]]+)?\]:/i;

export const extractInboundImageContextParts = (parts: string[]): string[] =>
  parts
    .map(part => part.trim())
    .filter(part => part && INBOUND_IMAGE_CONTEXT_PATTERN.test(part));

export const mergeInboundImageContextParts = (
  primaryText: string,
  messageParts: string[]
): string => {
  const imageParts = extractInboundImageContextParts(messageParts);
  if (!imageParts.length) {
    return primaryText.trim();
  }

  const blocks = [primaryText.trim(), ...imageParts].filter(Boolean);
  return [...new Set(blocks)].join("\n\n");
};

export const hasInboundImageContext = (text: string): boolean =>
  INBOUND_IMAGE_CONTEXT_PATTERN.test(text);
