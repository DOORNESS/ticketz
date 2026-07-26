import {
  buildInvestigationQuestion,
  buildTimeBasedGreeting,
  evaluateCaseCompleteness,
  isInformationalIntent,
  isMetaConversationIntent,
  isPureGreetingMessage,
  isShortHelpRequest,
  isSubstantiveAiReply,
  shouldSkipSupportInvestigation,
  isVagueCustomerStatement,
  shouldBlockAutomaticHandoff
} from "../CaseCompletenessEngine";

describe("CaseCompletenessEngine", () => {
  it("marks generic problem statements as vague", () => {
    expect(isVagueCustomerStatement("Estou com um problema.")).toBe(true);
    expect(isVagueCustomerStatement("Não consigo entrar.")).toBe(true);
    expect(isVagueCustomerStatement("Deu erro.")).toBe(true);
  });

  it("does not mark detailed login errors as vague", () => {
    expect(
      isVagueCustomerStatement(
        "Estou tentando entrar no WebG3 e aparece usuário não encontrado."
      )
    ).toBe(false);
  });

  it("returns investigation question for vague statements", () => {
    const snapshot = evaluateCaseCompleteness({
      latestMessage: "Estou com um problema.",
      conversationText: "user: Estou com um problema."
    });

    expect(snapshot.isVagueStatement).toBe(true);
    expect(snapshot.caseReadyForHandoff).toBe(false);
    expect(buildInvestigationQuestion(snapshot, "Estou com um problema.")).toContain(
      "sistema ou módulo"
    );
  });

  it("returns time-based greeting for pure hello messages", () => {
    const snapshot = evaluateCaseCompleteness({
      latestMessage: "Oi",
      conversationText: "user: Oi"
    });

    expect(isPureGreetingMessage("Oi")).toBe(true);
    expect(buildInvestigationQuestion(snapshot, "Oi")).toBe(
      `${buildTimeBasedGreeting()} Em que posso ajudar?`
    );
  });

  it("detects short help requests for fast-path replies", () => {
    expect(isShortHelpRequest("Pode ajudar?")).toBe(true);
    expect(isShortHelpRequest("teste")).toBe(true);
    expect(isShortHelpRequest("cade vc robozinho ?")).toBe(true);
    expect(isShortHelpRequest("Como funciona o Nível?")).toBe(false);
  });

  it("blocks automatic handoff until enough investigation rounds", () => {
    const snapshot = evaluateCaseCompleteness({
      latestMessage: "Oi",
      conversationText: "user: Oi",
      investigationRound: 1
    });

    expect(shouldBlockAutomaticHandoff(snapshot)).toBe(true);
  });

  it("collects missing information progressively for login cases", () => {
    const snapshot = evaluateCaseCompleteness({
      latestMessage: "Não consigo entrar.",
      conversationText: "user: Não consigo entrar.",
      investigationRound: 0
    });

    expect(snapshot.isVagueStatement).toBe(true);
    expect(snapshot.missingInformation.length).toBeGreaterThan(0);
  });

  it("marks case ready when enough diagnostic data exists", () => {
    const snapshot = evaluateCaseCompleteness({
      latestMessage:
        "No WebG3, ao informar meu e-mail e senha, aparece usuário não encontrado.",
      conversationText:
        "user: No WebG3, ao informar meu e-mail e senha, aparece usuário não encontrado."
    });

    expect(snapshot.caseReadyForResolution).toBe(true);
    expect(snapshot.confidence).toBeGreaterThan(0.4);
  });

  it("detects informational sales intent and skips support investigation", () => {
    const userText =
      "Eu quero saber como que eu posso fazer para saber mais do sistema de vocês, como ele pode ajudar a minha serralheria.";

    expect(isInformationalIntent(userText)).toBe(true);

    const snapshot = evaluateCaseCompleteness({
      latestMessage: userText,
      conversationText: `user: ${userText}`
    });

    expect(snapshot.missingInformation).toEqual([]);
    expect(snapshot.caseReadyForResolution).toBe(true);
    expect(buildInvestigationQuestion(snapshot, userText)).toBeNull();
  });

  it("detects how-it-works questions as informational", () => {
    const userText = "quero saber como funciona a nivel ?";

    expect(isInformationalIntent(userText)).toBe(true);
    expect(shouldSkipSupportInvestigation(userText)).toBe(true);
    expect(
      buildInvestigationQuestion(
        evaluateCaseCompleteness({
          latestMessage: userText,
          conversationText: `user: ${userText}`
        }),
        userText
      )
    ).toBeNull();
  });

  it("detects explain requests about Nivel as informational", () => {
    const userText = "Me explique o nível";

    expect(isInformationalIntent(userText)).toBe(true);
    expect(isVagueCustomerStatement(userText)).toBe(false);
    expect(
      buildInvestigationQuestion(
        evaluateCaseCompleteness({
          latestMessage: userText,
          conversationText: `user: ${userText}`
        }),
        userText
      )
    ).toBeNull();
  });

  it("detects polite explain requests as informational", () => {
    const userText = "Pode me explicar o nível";

    expect(isInformationalIntent(userText)).toBe(true);
    expect(
      buildInvestigationQuestion(
        evaluateCaseCompleteness({
          latestMessage: userText,
          conversationText: `user: ${userText}`
        }),
        userText
      )
    ).toBeNull();
  });

  it("detects product purpose questions as informational", () => {
    const userText = "Para que serve a fidelização?";

    expect(isInformationalIntent(userText)).toBe(true);
    expect(
      buildInvestigationQuestion(
        evaluateCaseCompleteness({
          latestMessage: userText,
          conversationText: `user: ${userText}`
        }),
        userText
      )
    ).toBeNull();
  });

  it("does not investigate detailed balance support cases", () => {
    const userText =
      "Eu troquei de celular e os dados não vieram certo no aplicativo. Eu tinha um saldo de uns 73, 80 reais e agora só aparece 1 real. Preciso recuperar meu saldo.";

    const snapshot = evaluateCaseCompleteness({
      latestMessage: userText,
      conversationText: `user: ${userText}`,
      hasMediaEvidence: true
    });

    expect(snapshot.caseReadyForResolution).toBe(true);
    expect(buildInvestigationQuestion(snapshot, userText)).toBeNull();
  });

  it("still treats explicit support problems as non-informational", () => {
    const userText =
      "Estou com um problema no login do WebG3, aparece usuário não encontrado.";

    expect(isInformationalIntent(userText)).toBe(false);
    expect(shouldSkipSupportInvestigation(userText)).toBe(false);
  });

  it("skips investigation for bot naming and identity chat", () => {
    expect(isMetaConversationIntent("Qual seu nome")).toBe(true);
    expect(isMetaConversationIntent("Vc precisa ter um nome. Será Webin")).toBe(
      true
    );
    expect(
      buildInvestigationQuestion(
        evaluateCaseCompleteness({
          latestMessage: "Qual seu nome",
          conversationText: "user: Qual seu nome"
        }),
        "Qual seu nome"
      )
    ).toBeNull();
  });

  it("recognizes substantive AI replies", () => {
    const shortGreeting = "Olá, boa noite! Em que posso ajudar?";
    const longAnswer =
      "O WebG3 é um sistema voltado para serralherias e esquadrias, com cálculos de esquadrias, orçamentos e uma base com milhares de projetos. Posso te ajudar com alguma dúvida específica ou agendar uma demonstração.";

    expect(isSubstantiveAiReply(shortGreeting)).toBe(false);
    expect(isSubstantiveAiReply(longAnswer)).toBe(true);
  });
});
