import { splitDeferrableConfirmation } from "../AiDeferredQuestionRules";

describe("splitDeferrableConfirmation", () => {
  it("recorta a confirmação do fluxo real de recuperação de conta", () => {
    const body = [
      "Claro! Posso ajudar você a recuperar sua conta. Primeiro, vamos utilizar a recuperação automática.",
      "",
      'Por favor, clique neste link: https://nivelvelo.com/recuperar-senha e insira seu e-mail, CPF ou CNPJ. Depois, clique em "Avançar".',
      "",
      "Conseguiu localizar sua conta?"
    ].join("\n");

    const split = splitDeferrableConfirmation(body);

    expect(split).not.toBeNull();
    expect(split?.deferred).toBe("Conseguiu localizar sua conta?");
    expect(split?.immediate).toContain("https://nivelvelo.com/recuperar-senha");
    expect(split?.immediate).not.toContain("Conseguiu localizar");
    expect(split?.immediate.trim().endsWith('"Avançar".')).toBe(true);
  });

  it("recorta outras confirmações de resultado do mesmo fluxo", () => {
    const cases = [
      "Deu certo?",
      "Funcionou?",
      "Recebeu o e-mail com a nova senha?",
      "Apareceu a tela de redefinição?"
    ];

    cases.forEach(question => {
      const body = `Acesse https://nivelvelo.com/recuperar-senha, informe seu CPF e clique em Avançar para redefinir a senha. ${question}`;
      expect(splitDeferrableConfirmation(body)?.deferred).toBe(question);
    });
  });

  it("nunca adia pergunta que pede dado do cliente", () => {
    const body =
      "Para recuperar sua senha eu preciso localizar seu cadastro. Acesse https://nivelvelo.com/recuperar-senha. Qual é o CPF cadastrado?";
    expect(splitDeferrableConfirmation(body)).toBeNull();
  });

  it("não mexe em resposta sem passo acionável antes da pergunta", () => {
    expect(
      splitDeferrableConfirmation("Você conseguiu recuperar a senha?")
    ).toBeNull();
  });

  it("não mexe em resposta fora do fluxo de recuperação", () => {
    const body =
      "Para consultar seu saldo de cashback, clique em https://nivelvelo.com/extrato e faça o filtro por período. Conseguiu visualizar?";
    expect(splitDeferrableConfirmation(body)).toBeNull();
  });

  it("não mexe em resposta que não termina em pergunta", () => {
    const body =
      "Acesse https://nivelvelo.com/recuperar-senha, insira seu CPF e clique em Avançar para redefinir sua senha.";
    expect(splitDeferrableConfirmation(body)).toBeNull();
  });

  it("não recorta pergunta longa, que costuma carregar instrução junto", () => {
    const body =
      "Acesse https://nivelvelo.com/recuperar-senha e informe seu CPF. Conseguiu localizar sua conta na lista que apareceu ou o sistema mostrou alguma mensagem de erro dizendo que o cadastro não foi encontrado?";
    expect(splitDeferrableConfirmation(body)).toBeNull();
  });
});
