import { hasInboundImageContext } from "./InboundImageContext";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const resolveAccountRecoverySuccessReply = (
  customerTurn: string
): string | null => {
  if (!hasInboundImageContext(customerTurn)) {
    return null;
  }

  const normalized = normalize(customerTurn);
  const confirmsSuccess =
    /solicitacao (?:foi )?enviada com sucesso/.test(normalized) ||
    /pedido (?:foi )?(?:enviado|registrado) com sucesso/.test(normalized);
  const promisesPasswordByEmail =
    /(?:nova )?senha.{0,100}(?:e-?mail|email)/s.test(normalized) ||
    /(?:e-?mail|email).{0,100}(?:nova )?senha/s.test(normalized);

  if (!confirmsSuccess || !promisesPasswordByEmail) {
    return null;
  }

  const mentionsTwentyFourBusinessHours =
    /24 horas uteis/.test(normalized) || /1 e 24 horas uteis/.test(normalized);
  const deadline = mentionsTwentyFourBusinessHours
    ? "em até 24 horas úteis"
    : "dentro do prazo informado na tela";

  return [
    "Deu certo! Sua solicitação de recuperação foi enviada com sucesso.",
    `Agora é só aguardar: a nova senha será enviada para o e-mail informado ${deadline}.`,
    "Fique de olho na caixa de entrada e também no spam ou lixo eletrônico.",
    "Não é necessário abrir outro chamado."
  ].join(" ");
};
