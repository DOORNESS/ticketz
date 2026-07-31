import { resolveAccountRecoverySuccessReply } from "../AccountRecoverySuccessReplyService";

describe("AccountRecoverySuccessReplyService", () => {
  it("confirms recovery and prevents a duplicate support ticket", () => {
    const turn = `
Apareceu uma mensagem

[Imagem enviada pelo cliente]: A tela informa "Solicitação enviada com sucesso".
Uma nova senha será enviada para o e-mail informado em até 24 horas úteis.
O prazo habitual é entre 1 e 24 horas úteis após a análise.
`.trim();

    const reply = resolveAccountRecoverySuccessReply(turn);

    expect(reply).toContain("Deu certo");
    expect(reply).toContain("até 24 horas úteis");
    expect(reply).toContain("spam");
    expect(reply).toContain("Não é necessário abrir outro chamado");
  });

  it("does not intercept an unsuccessful recovery screen", () => {
    const turn = `
[Imagem enviada pelo cliente]: Não foi possível enviar sua solicitação.
Verifique sua conexão e tente novamente.
`.trim();

    expect(resolveAccountRecoverySuccessReply(turn)).toBeNull();
  });

  it("only applies to facts extracted from an inbound image", () => {
    const turn =
      "A solicitação foi enviada com sucesso e a senha chegará por e-mail.";

    expect(resolveAccountRecoverySuccessReply(turn)).toBeNull();
  });
});
