/**
 * Avaliação de redação com o provedor real.
 *
 * O spec `NivelConversationQuality` prova o que o modelo *recebe*; ele não pode
 * provar como um LLM redige. Este script fecha a lacuna: monta exatamente o
 * mesmo prompt do caminho de produção (`buildDefaultOperationalRules` +
 * `ConversationAttemptStateService`) e chama o provedor de verdade, imprimindo
 * cliente → contexto → resposta para leitura humana.
 *
 * Roda fora do Jest de propósito: gasta cota da API e não deve entrar em CI.
 *
 * Uso:
 *   cd backend
 *   OPENAI_API_KEY=sk-... npx ts-node --transpile-only src/scripts/evalAiReplies.ts
 *
 * Opcional: EVAL_MODEL (padrão gpt-4o-mini).
 */
import OpenAI from "openai";
import { buildDefaultOperationalRules } from "../services/AiServices/AiPromptBuilder";
import { buildConversationAttemptState } from "../services/AiServices/ConversationAttemptStateService";
import { buildContextualRetrievalQuery } from "../services/AiServices/ContextualRetrievalQuery";

const BASE_PROMPT =
  "Você é o Nivelton, assistente virtual da Nível Cashback (programa de cashback do Grupo Fortmax).";

const RECOVERY_DOC = [
  "Recuperação de senha — procedimento oficial.",
  "Etapa 1 (padrão): quem lembra o e-mail e mantém acesso ao e-mail e ao telefone cadastrados deve acessar https://nivelvelo.com/recuperar-senha, informar e-mail, CPF ou CNPJ e clicar em Avançar. O sistema envia um código por SMS ou e-mail.",
  "Etapa 2 (quando a Etapa 1 não é possível ou não resolve): se o cliente perdeu o e-mail, não tem mais acesso ao e-mail ou ao telefone cadastrado, trocou de número, não recebeu o SMS, não recebeu o e-mail com os dígitos, ou já tentou a Etapa 1 sem sucesso, ele deve usar o formulário de validação de identidade em https://nivelvelo.com/esqueciminhasenha/suporte. A equipe valida a identidade e libera o acesso.",
  "Não encaminhe para a Etapa 1 quem já relatou qualquer situação da Etapa 2."
].join("\n");

const BALANCE_DOC = [
  "Saldo ou cashback que sumiu, zerou ou não aparece — inclusive após atualizar ou reinstalar o aplicativo.",
  "Primeiro passo, resolve a maioria dos casos: peça ao cliente para clicar no saldo dele e, dentro da tela Cashback, tocar em Ver Saldo Completo. O sistema verifica se algum saldo ficou para trás e atualiza.",
  "Só investigue mais a fundo (print, comprovante, CPF) se o cliente responder que já fez exatamente isso e o saldo continua incorreto."
].join("\n");

type Turn = { role: "user" | "assistant"; content: string };

type Scenario = {
  name: string;
  history: Turn[];
  userText: string;
  context: string;
  expectation: string;
};

const SCENARIOS: Scenario[] = [
  {
    name: "Primeiro contato — esqueci a senha",
    history: [],
    userText: "Esqueci minha senha.",
    context: RECOVERY_DOC,
    expectation: "Deve indicar a Etapa 1 (/recuperar-senha)."
  },
  {
    name: "Pré-requisito perdido já na 1ª mensagem",
    history: [],
    userText: "perdi meu email como entro",
    context: RECOVERY_DOC,
    expectation:
      "Deve ir direto para /esqueciminhasenha/suporte, SEM mandar /recuperar-senha."
  },
  {
    name: "Sequência — já tentou e não recebeu o SMS",
    history: [
      { role: "user", content: "Esqueci minha senha." },
      {
        role: "assistant",
        content:
          "Acesse https://nivelvelo.com/recuperar-senha, informe seu CPF e clique em Avançar."
      }
    ],
    userText: "Já tentei isso e não recebi o SMS.",
    expectation:
      "NÃO pode repetir /recuperar-senha; deve avançar para /esqueciminhasenha/suporte.",
    context: RECOVERY_DOC
  },
  {
    name: "WhatsApp cru — abreviado e sem acento",
    history: [
      { role: "user", content: "esqueci a senha" },
      {
        role: "assistant",
        content:
          "Acesse https://nivelvelo.com/recuperar-senha e informe seu CPF."
      }
    ],
    userText: "n chegou o codigo",
    context: RECOVERY_DOC,
    expectation: "Mesmo comportamento, com português informal."
  },
  {
    name: "Saldo sumiu após atualizar o app",
    history: [],
    userText:
      "foram atualizar meu aplicativo e o credito que tinha desapareceu, vc poderia olhar pra mim?",
    context: BALANCE_DOC,
    expectation:
      "Deve mandar clicar no saldo → tela Cashback → Ver Saldo Completo. Sem pedir CPF/print."
  },
  {
    name: "Saldo — variação curta não prevista",
    history: [],
    userText: "tinha dinheiro antes e agora ta zero",
    context: BALANCE_DOC,
    expectation: "Mesmo primeiro passo, sem frase literal cadastrada."
  }
];

const buildMessages = (scenario: Scenario) => {
  const agent = { name: "Nivelton", basePrompt: BASE_PROMPT } as never;
  const attemptState = buildConversationAttemptState(
    scenario.history,
    scenario.userText
  );

  const system = [
    BASE_PROMPT,
    "Responda em português, de forma clara e conversacional.",
    "Use o material da base de conhecimento abaixo.",
    "Não invente políticas, valores ou procedimentos que não estejam no material.",
    buildDefaultOperationalRules(agent),
    attemptState.promptBlock,
    `Material da base:\n${scenario.context}`
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    attemptState,
    retrievalQuery: buildContextualRetrievalQuery(
      scenario.userText,
      scenario.history
    ),
    messages: [
      { role: "system" as const, content: system },
      ...scenario.history.map(turn => ({
        role: turn.role,
        content: turn.content
      })),
      { role: "user" as const, content: scenario.userText }
    ]
  };
};

(async () => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "OPENAI_API_KEY não definida. Este script chama o provedor real e gasta cota."
    );
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.EVAL_MODEL || "gpt-4o-mini";
  let failures = 0;

  // eslint-disable-next-line no-restricted-syntax
  for (const scenario of SCENARIOS) {
    const { messages, attemptState, retrievalQuery } = buildMessages(scenario);

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 500,
      messages
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    const repeatedDiscardedStep = attemptState.offeredSteps.some(
      step => step.url && reply.includes(step.url)
    );

    console.log(`\n${"═".repeat(72)}`);
    console.log(`CENÁRIO      ${scenario.name}`);
    console.log(`CLIENTE      ${scenario.userText}`);
    console.log(`QUERY RAG    ${retrievalQuery.replace(/\n/g, " | ")}`);
    console.log(
      `ESTADO       ${
        attemptState.reportedFailure
          ? `falha relatada; descartado: ${
              attemptState.offeredSteps.map(step => step.url).join(", ") ||
              "(nenhum link anterior)"
            }`
          : "primeiro contato"
      }`
    );
    console.log(`ESPERADO     ${scenario.expectation}`);
    console.log(`\nRESPOSTA:\n${reply}`);

    if (repeatedDiscardedStep) {
      failures += 1;
      console.log("\n❌ REGRESSÃO: repetiu um passo já descartado.");
    }
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(
    failures
      ? `${failures} cenário(s) repetiram passo descartado.`
      : "Nenhum cenário repetiu passo descartado."
  );
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
