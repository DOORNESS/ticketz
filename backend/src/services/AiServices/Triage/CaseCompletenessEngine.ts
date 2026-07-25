import { CaseCompletenessSnapshot } from "./AiTriageTypes";

const PURE_GREETING_PATTERNS = [
  /^\s*(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|tudo bem)\s*[!.?]*\s*$/i
];

const VAGUE_PATTERNS = [
  ...PURE_GREETING_PATTERNS,
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

const INFORMATIONAL_INTENT_PATTERNS = [
  /quero saber/i,
  /gostaria de saber/i,
  /saber mais/i,
  /conhecer (?:o |melhor )?(?:sistema|produto|software|programa)/i,
  /como (?:que )?(?:eu )?(?:posso|faço)/i,
  /como (?:ele |o sistema |voc[eê]s )?(?:pode|podem|ajuda)/i,
  /(?:demo|demonstraç)/i,
  /(?:o que [eé]|como funciona)/i,
  /(?:me fale|me conte) sobre/i,
  /ajudar (?:a )?(?:minha|meu)/i,
  /funcionalidades|recursos/i
];

const META_CONVERSATION_PATTERNS = [
  /qual (?:é |e )?(?:o |)(?:seu )?nome/i,
  /como (?:voc[eê]|vc) se chama/i,
  /quem (?:é |e )(?:voc[eê]|vc)/i,
  /(?:ser[aá]|chame?|me chame)(?:\s+de)?\s+webin/i,
  /precisa ter um nome/i,
  /(?:^|\s)webin(?:\s|$)/i,
  /^obrigad[oa][!.?\s]*$/i,
  /vou aguardar/i,
  /hor[aá]rio comercial/i,
  /pr[oó]ximo hor[aá]rio/i
];

const SUPPORT_PROBLEM_PATTERNS = [
  /problema/i,
  /erro/i,
  /n[aã]o (?:est[aá] |)(?:funcionando|funciona|consigo|abre|entra)/i,
  /deu (?:erro|pau)/i,
  /bug/i,
  /travou/i,
  /encontrei (?:esse |um )?problema/i
];

const INVESTIGATION_TEMPLATE_PATTERNS = [
  /Em qual tela, m[oó]dulo ou funcionalidade/i,
  /Em qual sistema ou produto/i,
  /Entendi\. Pode me explicar o que est[aá] acontecendo/i,
  /Em que posso ajudar/i,
  /O que voc[eê] estava tentando fazer/i,
  /Depois dessa a[cç][aã]o/i,
  /mensagem de erro/i,
  /celular ou computador/i,
  /print, [aá]udio ou comprovante/i
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

export const isPureGreetingMessage = (text: string): boolean =>
  PURE_GREETING_PATTERNS.some(pattern => pattern.test(text.trim()));

const SHORT_HELP_PATTERNS = [
  /^\s*pode ajudar\??\s*$/i,
  /^\s*pode me ajudar\??\s*$/i,
  /^\s*preciso de ajuda\??\s*$/i,
  /^\s*me ajuda\??\s*$/i,
  /^\s*ajuda\??\s*$/i,
  /^\s*cade vc\b/i,
  /^\s*teste\s*$/i
];

export const isShortHelpRequest = (text: string): boolean =>
  SHORT_HELP_PATTERNS.some(pattern => pattern.test(text.trim()));

export const isMetaConversationIntent = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return META_CONVERSATION_PATTERNS.some(pattern => pattern.test(normalized));
};

export const isInformationalIntent = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  if (SUPPORT_PROBLEM_PATTERNS.some(pattern => pattern.test(normalized))) {
    return false;
  }

  if (isMetaConversationIntent(normalized)) {
    return true;
  }

  return INFORMATIONAL_INTENT_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );
};

export const shouldSkipSupportInvestigation = (text: string): boolean =>
  isInformationalIntent(text);

export const isInvestigationTemplateMessage = (body: string): boolean =>
  INVESTIGATION_TEMPLATE_PATTERNS.some(pattern => pattern.test(body.trim()));

export const isSubstantiveAiReply = (body: string): boolean => {
  const normalized = body.trim();
  if (!normalized || normalized.length < 120) {
    return false;
  }

  return !isInvestigationTemplateMessage(normalized);
};

export const buildTimeBasedGreeting = (
  timezone = "America/Sao_Paulo"
): string => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone
    }).format(new Date())
  );

  if (hour >= 5 && hour < 12) {
    return "Olá, bom dia!";
  }

  if (hour >= 12 && hour < 18) {
    return "Olá, boa tarde!";
  }

  return "Olá, boa noite!";
};

export const MIN_INVESTIGATION_ROUNDS_BEFORE_HANDOFF = 2;

export const shouldBlockAutomaticHandoff = (
  snapshot: CaseCompletenessSnapshot,
  {
    explicitHumanRequest = false,
    sensitive = false,
    minRounds = MIN_INVESTIGATION_ROUNDS_BEFORE_HANDOFF
  }: {
    explicitHumanRequest?: boolean;
    sensitive?: boolean;
    minRounds?: number;
  } = {}
): boolean => {
  if (explicitHumanRequest || sensitive) {
    return false;
  }

  return (
    snapshot.isVagueStatement ||
    snapshot.investigationRound < minRounds ||
    !snapshot.caseReadyForHandoff
  );
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
  const informationalIntent = shouldSkipSupportInvestigation(latest);

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

  if (!informationalIntent) {
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

  const caseReadyForResolution = informationalIntent
    ? true
    : !isVagueStatement &&
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
  snapshot: CaseCompletenessSnapshot,
  latestMessage = ""
): string | null => {
  if (shouldSkipSupportInvestigation(latestMessage)) {
    return null;
  }

  if (snapshot.isVagueStatement) {
    if (
      snapshot.investigationRound === 0 &&
      isPureGreetingMessage(latestMessage)
    ) {
      return `${buildTimeBasedGreeting()} Em que posso ajudar?`;
    }

    return "Entendi. Pode me explicar o que está acontecendo e em qual sistema ou módulo?";
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
