export const replaceOptimisticMessage = (
  messages,
  temporaryId,
  confirmedMessage
) => {
  const withoutTemporary = messages.filter(
    message => message.id !== temporaryId
  );
  const confirmedIndex = withoutTemporary.findIndex(
    message => message.id === confirmedMessage.id
  );

  if (confirmedIndex !== -1) {
    withoutTemporary[confirmedIndex] = confirmedMessage;
  } else {
    withoutTemporary.push(confirmedMessage);
  }

  return withoutTemporary;
};

export const removeOptimisticMessage = (messages, temporaryId) =>
  messages.filter(message => message.id !== temporaryId);
