import { CaseCompletenessSnapshot } from "./AiTriageTypes";

const VAGUE_PATTERNS = [
  /^\s*(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|tudo bem)\s*[!.?]*\s*$/i,
  /^\s*(estou com (um )?problema|tenho (um )?problema|preciso de ajuda)\s*[!.?]*\s*$/i,
  /^\s*(n[aã]o est[aá] funcionando|n[aã]o funciona|parou|deu erro|deu pau)\s*[!.?]*\s*$/i,
  /^\s*(n[aã]o consigo entrar|n[aã]o consigo acessar|n[aã]o consigo logar)\s*[!.?]*\s*$/i,
  /^\s*(meu pagamento n[aã]o entrou|pagamento n[aã]o caiu)\s*[!.?]*\s*$/i,
  /^\s*(n[aã]o consegui emitir|n[aã]o consigo emitir)\s*[!.?]*\s*$/i,
  /^\s*(o sistema parou|sistema n[aã]o abre)\s*[!.?]*\s*$/i,
  /^\s*ok\s*[!.?]*\s*$/i
];

const PRODUCT_HINTS = [
  "webg3",
  "ticketz",
  "fortmax",
  "sistema",
  "m[oó]dulo",
  "erp",
  "portal",
  "app",
  "aplicativo"
];

const MODULE_HINTS = [
  "login",
  "acesso",
  "entrada",
  "financeiro",
  "fiscal",
  "estoque",
  "pagamento",
  "boleto",
  "nf",
  "nota",
  "cadastro",
  "usu[aá]rio",
  "senha"
];

const ERROR_HINTS = [
  "erro",
  "mensagem",
  "invalid",
  "failed",
  "n[aã]o encontrado",
  "unauthorized",
  "403",
  "404",
  "500",
  "timeout",
  "oauth"
];

const ACTION_HINTS = [
  "tentei",
  "cliquei",
  "informei",
  "digitei",
  "acessei",
  "abri",
  "fiz",
  "estava tentando"
];

const EVIDENCE_HINTS = [
  "print",
  "imagem",
  "foto",
  "anexo",
  "comprovante",
  "pdf",
  "audio",
  "áudio",
  "video",
  "vídeo"
];

const hasAny = (text: string, patterns: (string | RegExp)[]): boolean =>
  patterns.some(pattern =>
    typeof pattern === "string"
      ? text.toLowerCase().includes(pattern)
      : pattern.test(text)
  );

const countFilled = (
  snapshot: Omit<
    CaseCompletenessSnapshot,
    | "confidence"
    | "missingInformation"
    | "caseReadyForResolution"
    | "caseReadyForHandoff"
    | "isVagueStatement"
    | "investigationRound"
  >
): number => {
  return Object.values(snapshot).filter(Boolean).length;
};

export const isVagueCustomerStatement = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }

  if (VAGUE_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length <= 4 && !hasAny(normalized, MODULE_HINTS);
};

export const evaluateCaseCompleteness = ({
  latestMessage,
  conversationText,
  investigationRound = 0,
  hasMediaEvidence = false
}: {
  latestMessage: string;
  conversationText: string;
  investigationRound?: number;
  hasMediaEvidence?: boolean;
}): CaseCompletenessSnapshot => {
  const text = `${conversationText}\n${latestMessage}`.toLowerCase();
  const latest = latestMessage.trim();

  const intentIdentified =
    !isVagueCustomerStatement(latest) ||
    hasAny(text, [...MODULE_HINTS, ...ACTION_HINTS, ...ERROR_HINTS]);

  const productIdentified = hasAny(text, PRODUCT_HINTS);
  const affectedModule = hasAny(text, MODULE_HINTS);
  const problemDescription =
    latest.length > 20 || hasAny(text, ERROR_HINTS) || affectedModule;
  const attemptedAction = hasAny(text, ACTION_HINTS);
  const expectedBehavior = /esperava|deveria|normalmente|costuma/i.test(text);
  const actualBehavior =
    /acontece|aparece|mostra|retorna|fica|ocorre/i.test(text) ||
    hasAny(text, ERROR_HINTS);
  const errorMessage = hasAny(text, ERROR_HINTS);
  const reproductionSteps =
    attemptedAction && (actualBehavior || errorMessage || affectedModule);
  const environmentInformation =
    /android|iphone|ios|windows|mac|linux|chrome|firefox|safari|edge|celular|computador|navegador/i.test(
      text
    );
  const evidenceAvailable = hasMediaEvidence || hasAny(text, EVIDENCE_HINTS);
  const troubleshootingAttempts =
    /j[aá] tentei|j[aá] fiz|reiniciei|limpei cache|desinstalei|reinstalei|novamente/i.test(
      text
    );

  const missingInformation: string[] = [];

  if (!productIdentified) {
    missingInformation.push("produto ou sistema envolvido");
  }
  if (!affectedModule) {
    missingInformation.push("módulo, tela ou funcionalidade afetada");
  }
  if (!problemDescription) {
    missingInformation.push("descrição objetiva do problema");
  }
  if (!attemptedAction) {
    missingInformation.push("ação que o cliente estava tentando realizar");
  }
  if (!actualBehavior && !errorMessage) {
    missingInformation.push("resultado observado ou mensagem de erro");
  }
  if (!errorMessage && /login|acesso|entrada|senha/i.test(text)) {
    missingInformation.push("mensagem de erro exibida, se houver");
  }
  if (!environmentInformation && investigationRound >= 1) {
    missingInformation.push("dispositivo ou navegador utilizado");
  }
  if (!evidenceAvailable && investigationRound >= 2) {
    missingInformation.push("print, áudio ou comprovante, se disponível");
  }

  const filledCount = countFilled({
    intentIdentified,
    productIdentified,
    affectedModule,
    problemDescription,
    attemptedAction,
    expectedBehavior,
    actualBehavior,
    errorMessage,
    reproductionSteps,
    environmentInformation,
    evidenceAvailable,
    troubleshootingAttempts
  });

  const confidence = Math.min(1, filledCount / 8);
  const isVagueStatement = isVagueCustomerStatement(latest);

  const caseReadyForResolution =
    !isVagueStatement &&
    problemDescription &&
    (actualBehavior || errorMessage) &&
    (productIdentified || affectedModule);

  const caseReadyForHandoff =
    caseReadyForResolution &&
    (reproductionSteps || errorMessage || troubleshootingAttempts) &&
    confidence >= 0.55;

  return {
    intentIdentified,
    productIdentified,
    affectedModule,
    problemDescription,
    attemptedAction,
    expectedBehavior,
    actualBehavior,
    errorMessage,
    reproductionSteps,
    environmentInformation,
    evidenceAvailable,
    troubleshootingAttempts,
    confidence,
    missingInformation,
    caseReadyForResolution,
    caseReadyForHandoff,
    isVagueStatement,
    investigationRound
  };
};

export const buildInvestigationQuestion = (
  snapshot: CaseCompletenessSnapshot
): string => {
  if (snapshot.isVagueStatement) {
    return "Claro, vou ajudar você. Pode me explicar o que está acontecendo e em qual sistema ou módulo?";
  }

  const next = snapshot.missingInformation[0];

  if (!next) {
    return "Entendi. Pode me contar um pouco mais sobre o que aconteceu e o que você esperava que ocorresse?";
  }

  if (next.includes("produto")) {
    return "Entendi. Em qual sistema ou produto isso está acontecendo?";
  }

  if (next.includes("módulo")) {
    return "Certo. Em qual tela, módulo ou funcionalidade você encontrou esse problema?";
  }

  if (next.includes("ação")) {
    return "O que você estava tentando fazer quando isso aconteceu?";
  }

  if (next.includes("resultado")) {
    return "Depois dessa ação, o que apareceu na tela ou qual foi o resultado?";
  }

  if (next.includes("mensagem de erro")) {
    return "Aparece alguma mensagem de erro? Se sim, pode me dizer exatamente o texto?";
  }

  if (next.includes("dispositivo")) {
    return "Você está acessando pelo celular ou computador? Qual navegador ou aplicativo está usando?";
  }

  if (next.includes("print")) {
    return "Se tiver um print, áudio ou comprovante, pode enviar aqui para eu analisar com mais precisão.";
  }

  return `Para eu te ajudar melhor, preciso saber: ${next}.`;
};
