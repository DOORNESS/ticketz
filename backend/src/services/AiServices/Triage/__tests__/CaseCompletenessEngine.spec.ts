import {
  buildInvestigationQuestion,
  evaluateCaseCompleteness,
  isVagueCustomerStatement
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
    expect(buildInvestigationQuestion(snapshot)).toContain("sistema ou módulo");
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
});
