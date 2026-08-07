import {
  buildConversationAttemptState,
  detectCustomerFailureReport,
  extractAssistantOfferedSteps
} from "../ConversationAttemptStateService";

describe("detectCustomerFailureReport", () => {
  // Como o cliente escreve de verdade no WhatsApp: sem acento, abreviado,
  // com erro de digitação e sem pontuação.
  const reportsFailure = [
    "ja tentei recuperar",
    "já tentei recuperar a senha e não consegui",
    "Já tentei isso e não recebi o SMS",
    "n chegou o codigo",
    "não chegou o código",
    "nao recebi o email",
    "não recebi o e-mail com os dígitos",
    "nao chegaram os digitos",
    "o recuperar senha nao funcionou",
    "fiz isso e continua igual",
    "já fiz o que você pediu e nada aconteceu",
    "perdi meu email",
    // Pergunta de primeiro contato, mas já declara o pré-requisito perdido:
    // mandar o formulário padrão aqui é exatamente o erro a evitar.
    "perdi meu email como entro",
    "perdi meu e-mail e nao tenho mais acesso",
    "não tenho mais acesso ao meu e-mail",
    "nao tenho acesso ao email cadastrado",
    "troquei meu telefone",
    "mudei de numero",
    "meu email foi hackeado",
    "nao lembro qual email usei",
    "tentei e deu erro",
    "nao consegui entrar",
    "sem sucesso"
  ];

  it.each(reportsFailure)("reconhece falha em: %s", text => {
    expect(detectCustomerFailureReport(text)).toBe(true);
  });

  // Primeiro contato, pedido de ajuda ou intenção futura: ainda não falhou nada.
  const doesNotReportFailure = [
    "esqueci minha senha",
    "quero recuperar minha senha",
    "vou tentar agora",
    "posso tentar de novo?",
    "como faço para recuperar a senha",
    "bom dia",
    "meu saldo sumiu",
    "atualizei o app e meu saldo sumiu",
    "como funciona o cashback"
  ];

  it.each(doesNotReportFailure)("não marca falha em: %s", text => {
    expect(detectCustomerFailureReport(text)).toBe(false);
  });
});

describe("extractAssistantOfferedSteps", () => {
  it("captura os links já enviados, do mais recente para o mais antigo", () => {
    const steps = extractAssistantOfferedSteps([
      { role: "user", content: "esqueci minha senha" },
      {
        role: "assistant",
        content:
          "Acesse https://nivelvelo.com/recuperar-senha e informe seu CPF. Depois clique em Avançar."
      },
      { role: "user", content: "ok" },
      {
        role: "assistant",
        content: "Se preferir, veja também https://nivelvelo.com/ajuda."
      }
    ]);

    expect(steps.map(step => step.url)).toEqual([
      "https://nivelvelo.com/ajuda",
      "https://nivelvelo.com/recuperar-senha"
    ]);
    expect(steps[1].summary).toContain("informe seu CPF");
  });

  it("remove pontuação final e não duplica o mesmo link", () => {
    const steps = extractAssistantOfferedSteps([
      { role: "assistant", content: "Acesse https://nivelvelo.com/x." },
      { role: "assistant", content: "Repito: https://nivelvelo.com/x" }
    ]);

    expect(steps).toHaveLength(1);
    expect(steps[0].url).toBe("https://nivelvelo.com/x");
  });

  it("ignora links que o próprio cliente enviou", () => {
    const steps = extractAssistantOfferedSteps([
      {
        role: "user",
        content: "entrei em https://nivelvelo.com/recuperar-senha"
      }
    ]);

    expect(steps).toHaveLength(0);
  });
});

describe("buildConversationAttemptState", () => {
  const history = [
    { role: "user" as const, content: "Esqueci minha senha." },
    {
      role: "assistant" as const,
      content:
        "Acesse https://nivelvelo.com/recuperar-senha, informe seu CPF e clique em Avançar."
    }
  ];

  it("gera bloco de estado quando o cliente relata falha", () => {
    const state = buildConversationAttemptState(
      history,
      "Já tentei isso e não recebi o SMS."
    );

    expect(state.reportedFailure).toBe(true);
    expect(state.promptBlock).toContain("NÃO reenvie os mesmos links");
    expect(state.promptBlock).toContain(
      "https://nivelvelo.com/recuperar-senha"
    );
    expect(state.promptBlock).toContain("não recebi o SMS");
    expect(state.promptBlock).toContain("etapa seguinte");
  });

  it("fica vazio no primeiro contato — não restringe sem motivo", () => {
    const state = buildConversationAttemptState([], "Esqueci minha senha.");

    expect(state.reportedFailure).toBe(false);
    expect(state.promptBlock).toBe("");
  });

  it("marca falha mesmo sem link anterior (perda de pré-requisito)", () => {
    const state = buildConversationAttemptState(
      [],
      "perdi meu email e nao tenho mais acesso"
    );

    expect(state.reportedFailure).toBe(true);
    expect(state.promptBlock).toContain("NÃO resolveu");
    expect(state.promptBlock).not.toContain("Passos já oferecidos");
  });

  it("é agnóstico de tema — vale para qualquer procedimento", () => {
    const state = buildConversationAttemptState(
      [
        {
          role: "assistant",
          content:
            "Emita a segunda via em https://exemplo.com/segunda-via e informe o código."
        }
      ],
      "fiz isso e continua igual"
    );

    expect(state.reportedFailure).toBe(true);
    expect(state.promptBlock).toContain("https://exemplo.com/segunda-via");
  });
});
