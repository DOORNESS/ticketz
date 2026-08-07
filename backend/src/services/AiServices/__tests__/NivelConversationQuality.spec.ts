/**
 * Avaliação de qualidade do atendimento — o que o robô recebe para raciocinar.
 *
 * Cada cenário percorre o caminho real de resposta do WhatsApp
 * (`tryInformationalDirectReply`) e registra, para inspeção humana:
 *
 *   cliente perguntou → query usada no retrieval → fonte recuperada →
 *   contexto e restrições que chegaram ao modelo → resposta
 *
 * O retrieval é exercitado de verdade: o mock pontua a query contra um corpus
 * controlado, então "qual fonte foi recuperada" é consequência da query que o
 * sistema montou, não de um valor fixo no teste.
 *
 * Limite honesto: o provedor é substituído por um duplo determinístico, então
 * estes testes provam o que o modelo *recebe*, não como um LLM real redige.
 * Para avaliar redação com o provedor real use `npm run eval:ai-replies`.
 */
import Message from "../../../models/Message";
import { chatCompletion } from "../ModelGateway";
import { buildKnowledgeContextForQuery } from "../KnowledgeContextService";
import { tryInformationalDirectReply } from "../InformationalDirectReplyService";

jest.mock("../../../models/Message");
jest.mock("../ModelGateway", () => ({ chatCompletion: jest.fn() }));
jest.mock("../KnowledgeContextService", () => ({
  buildKnowledgeContextForQuery: jest.fn()
}));
jest.mock("../AiHelpers", () => ({
  getKnowledgeBaseIdsForAgent: jest.fn(async () => [11])
}));

/** Corpus controlado, no formato de procedimento que a base real usa. */
const CORPUS = [
  {
    id: "recuperar-conta-e-senha",
    title: "Recuperar conta e senha",
    terms: [
      "senha",
      "recuperar",
      "esqueci",
      "acesso",
      "conta",
      "email",
      "e-mail",
      "sms",
      "codigo",
      "digitos",
      "telefone",
      "login",
      "entro",
      "entrar"
    ],
    content: [
      "Recuperação de senha — procedimento oficial.",
      "Etapa 1 (padrão): o cliente que lembra o e-mail e mantém acesso ao e-mail e ao telefone cadastrados deve acessar https://nivelvelo.com/recuperar-senha, informar e-mail, CPF ou CNPJ e clicar em Avançar. O sistema envia um código por SMS ou e-mail.",
      "Etapa 2 (quando a Etapa 1 não é possível ou não resolve): se o cliente perdeu o e-mail, não tem mais acesso ao e-mail ou ao telefone cadastrado, trocou de número, não recebeu o SMS, não recebeu o e-mail com os dígitos, ou já tentou a Etapa 1 sem sucesso, ele deve usar o formulário de validação de identidade em https://nivelvelo.com/esqueciminhasenha/suporte. A equipe valida a identidade e libera o acesso.",
      "Não encaminhe para a Etapa 1 quem já relatou qualquer uma das situações da Etapa 2."
    ].join("\n")
  },
  {
    id: "saldo-cashback-nao-aparece",
    title: "Saldo de cashback não aparece",
    terms: [
      "saldo",
      "cashback",
      "credito",
      "sumiu",
      "desapareceu",
      "zerou",
      "zerado",
      "atualizei",
      "atualizar",
      "aplicativo",
      "app",
      "reinstalei",
      "dinheiro",
      "nao aparece"
    ],
    content: [
      "Saldo ou cashback que sumiu, zerou ou não aparece — inclusive após atualizar ou reinstalar o aplicativo.",
      "Primeiro passo, resolve a maioria dos casos: peça ao cliente para clicar no saldo dele e, dentro da tela Cashback, tocar em Ver Saldo Completo. O sistema verifica se algum saldo ficou para trás e atualiza.",
      "Só investigue mais a fundo (print, comprovante, CPF) se o cliente responder que já fez exatamente isso e o saldo continua incorreto."
    ].join("\n")
  },
  {
    id: "como-funciona-o-nivel",
    title: "O que é o Nível Cashback",
    terms: [
      "nivel",
      "cashback",
      "funciona",
      "programa",
      "beneficio",
      "vantagem"
    ],
    content:
      "O Nível Cashback é o programa de cashback do Grupo Fortmax: o cliente compra em estabelecimentos participantes e recebe parte do valor de volta como saldo."
  }
];

const normalize = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Retrieval simplificado, mas dirigido pela query que o sistema montou. */
const retrieveFromCorpus = (query: string) => {
  const haystack = normalize(query);
  const scored = CORPUS.map(doc => ({
    doc,
    score: doc.terms.filter(term => haystack.includes(normalize(term))).length
  }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 2).map(entry => entry.doc);
};

type Evidence = {
  scenario: string;
  customerSaid: string;
  retrievalQuery: string;
  retrievedSources: string[];
  systemPrompt: string;
  historySentToModel: { role: string; content: string }[];
  reply: string;
};

const evidence: Evidence[] = [];

const runTurn = async ({
  scenario,
  history,
  userText
}: {
  scenario: string;
  history: { fromMe: boolean; body: string }[];
  userText: string;
}): Promise<Evidence> => {
  (Message.findAll as jest.Mock).mockResolvedValue(
    [...history].reverse().map((item, index) => ({
      id: index,
      fromMe: item.fromMe,
      body: item.body
    }))
  );

  let capturedQuery = "";
  let retrieved: typeof CORPUS = [];

  (buildKnowledgeContextForQuery as jest.Mock).mockImplementation(
    async ({ userText: query }: { userText: string }) => {
      capturedQuery = query;
      retrieved = retrieveFromCorpus(query);

      return {
        contextBlock: retrieved
          .map(
            (doc, idx) => `[Trecho ${idx + 1} — ${doc.title}]\n${doc.content}`
          )
          .join("\n\n"),
        usedChunks: retrieved.map((doc, idx) => ({
          id: idx,
          content: doc.content,
          similarity: 0.8 - idx * 0.1
        })),
        hasReadyDocuments: retrieved.length > 0,
        reingestedDocuments: 0
      };
    }
  );

  let captured: { role: string; content: string }[] = [];

  (chatCompletion as jest.Mock).mockImplementation(async (_c, options) => {
    captured = options.messages;
    return {
      content: "[resposta do provedor]",
      tokensInput: 0,
      tokensOutput: 0
    };
  });

  const result = await tryInformationalDirectReply({
    companyId: 1,
    ticket: { id: 99, queueId: 4 } as never,
    agent: {
      id: 3,
      name: "Nivelton",
      provider: "openai",
      textModel: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1024,
      basePrompt: "Você é o Nivelton, assistente virtual da Nível Cashback."
    } as never,
    userText
  });

  const record: Evidence = {
    scenario,
    customerSaid: userText,
    retrievalQuery: capturedQuery,
    retrievedSources: retrieved.map(doc => doc.id),
    systemPrompt: String(captured[0]?.content || ""),
    historySentToModel: captured.slice(1),
    reply: result.body || ""
  };

  evidence.push(record);
  return record;
};

afterAll(() => {
  const report = evidence
    .map(item =>
      [
        `\n━━━ ${item.scenario}`,
        `cliente:   ${item.customerSaid}`,
        `query RAG: ${item.retrievalQuery.replace(/\n/g, " | ")}`,
        `fontes:    ${item.retrievedSources.join(", ") || "(nenhuma)"}`,
        `turnos ao modelo: ${item.historySentToModel
          .map(turn => `${turn.role}:"${turn.content.slice(0, 40)}"`)
          .join(" ")}`,
        `estado da conversa no prompt: ${
          item.systemPrompt.includes("Estado desta conversa")
            ? "SIM — passos descartados listados"
            : "não (primeiro contato)"
        }`
      ].join("\n")
    )
    .join("\n");

  console.log(`\n===== EVIDÊNCIA DE ATENDIMENTO =====${report}\n`);
});

describe("1. Recuperação de conta — primeiro contato", () => {
  it("recupera o procedimento de senha e não restringe nada ainda", async () => {
    const record = await runTurn({
      scenario: "1a. 'esqueci minha senha' (primeiro contato)",
      history: [],
      userText: "Esqueci minha senha."
    });

    expect(record.retrievedSources).toContain("recuperar-conta-e-senha");
    // Sem relato de falha, o modelo fica livre para indicar a Etapa 1.
    expect(record.systemPrompt).not.toContain("Estado desta conversa");
    expect(record.systemPrompt).toContain("Etapa 1");
    expect(record.systemPrompt).toContain("Etapa 2");
  });
});

describe("2. Recuperação de conta — cliente já passou da etapa 1", () => {
  it("perdi meu email: marca a etapa padrão como descartada já na 1ª mensagem", async () => {
    const record = await runTurn({
      scenario: "2a. 'perdi meu email como entro' (pré-requisito perdido)",
      history: [],
      userText: "perdi meu email como entro"
    });

    expect(record.retrievedSources).toContain("recuperar-conta-e-senha");
    expect(record.systemPrompt).toContain("Estado desta conversa");
    expect(record.systemPrompt).toContain("etapa seguinte");
    // A alternativa correta está no contexto para o modelo escolher.
    expect(record.systemPrompt).toContain(
      "https://nivelvelo.com/esqueciminhasenha/suporte"
    );
  });

  it("sequência: 'esqueci a senha' → 'já tentei, não chegou o SMS'", async () => {
    const record = await runTurn({
      scenario: "2b. sequência de 2 mensagens (o caso do relato)",
      history: [
        { fromMe: false, body: "Esqueci minha senha." },
        {
          fromMe: true,
          body: "Acesse https://nivelvelo.com/recuperar-senha, informe seu CPF e clique em Avançar."
        }
      ],
      userText: "Já tentei isso e não recebi o SMS."
    });

    // A query de retrieval carrega os dois turnos do cliente, não só o último.
    expect(record.retrievalQuery).toContain("Esqueci minha senha");
    expect(record.retrievalQuery).toContain("não recebi o SMS");
    expect(record.retrievedSources).toContain("recuperar-conta-e-senha");

    // O link já gasto é nomeado como descartado.
    expect(record.systemPrompt).toContain("Estado desta conversa");
    expect(record.systemPrompt).toContain(
      "https://nivelvelo.com/recuperar-senha"
    );
    expect(record.systemPrompt).toContain("NÃO reenvie os mesmos links");

    // E a alternativa está disponível no material.
    expect(record.systemPrompt).toContain(
      "https://nivelvelo.com/esqueciminhasenha/suporte"
    );
  });

  it("'n chegou o codigo' — informal, abreviado e sem acento", async () => {
    const record = await runTurn({
      scenario: "2c. 'n chegou o codigo' (WhatsApp cru)",
      history: [
        { fromMe: false, body: "esqueci a senha" },
        {
          fromMe: true,
          body: "Acesse https://nivelvelo.com/recuperar-senha e informe seu CPF."
        }
      ],
      userText: "n chegou o codigo"
    });

    expect(record.systemPrompt).toContain("Estado desta conversa");
    expect(record.systemPrompt).toContain(
      "https://nivelvelo.com/recuperar-senha"
    );
  });
});

describe("3. Saldo/cashback desaparecido", () => {
  const variations = [
    "foram atualizar meu aplicativo e o credito que tinha desapareceu, vc poderia olhar pra mim?",
    "meu saldo sumiu",
    "atualizei o app e meu saldo sumiu",
    "meu credito ficou zerado",
    "meu cashback zerou",
    "tinha dinheiro antes e agora ta zero",
    "reinstalei o aplicativo e meu cashback nao aparece"
  ];

  it.each(variations)(
    "recupera o procedimento de saldo para: %s",
    async userText => {
      const record = await runTurn({
        scenario: `3. saldo — "${userText.slice(0, 45)}"`,
        history: [],
        userText
      });

      expect(record.retrievedSources[0]).toBe("saldo-cashback-nao-aparece");
      // O passo resolutivo chega ao modelo…
      expect(record.systemPrompt).toContain("Ver Saldo Completo");
      // …e a instrução de não começar pedindo print/CPF também.
      expect(record.systemPrompt).toContain("Só investigue mais a fundo");
    }
  );
});

describe("4. Higiene do que chega ao modelo", () => {
  it("não duplica o turno atual do cliente", async () => {
    const record = await runTurn({
      scenario: "4a. anti-duplicação do turno atual",
      history: [
        { fromMe: false, body: "Esqueci minha senha." },
        { fromMe: true, body: "Acesse https://nivelvelo.com/recuperar-senha." },
        // wbotMessageListener já persistiu a mensagem atual antes da IA rodar:
        { fromMe: false, body: "Já tentei isso e não recebi o SMS." }
      ],
      userText: "Já tentei isso e não recebi o SMS."
    });

    const userTurns = record.historySentToModel.filter(
      turn => turn.role === "user"
    );
    const duplicated = userTurns.filter(
      turn => turn.content === "Já tentei isso e não recebi o SMS."
    );

    expect(duplicated).toHaveLength(1);
    expect(userTurns[userTurns.length - 1].content).toBe(
      "Já tentei isso e não recebi o SMS."
    );
  });

  it("mantém o histórico anterior visível para o modelo", async () => {
    const record = await runTurn({
      scenario: "4b. histórico preservado",
      history: [
        { fromMe: false, body: "Esqueci minha senha." },
        { fromMe: true, body: "Acesse https://nivelvelo.com/recuperar-senha." }
      ],
      userText: "já tentei"
    });

    expect(
      record.historySentToModel.some(turn =>
        turn.content.includes("Esqueci minha senha")
      )
    ).toBe(true);
  });

  it("pergunta fora do previsto não inventa procedimento", async () => {
    const record = await runTurn({
      scenario: "4c. pergunta sem cobertura na base",
      history: [],
      userText: "vocês têm loja física em Ribeirão Preto?"
    });

    // Nada relevante recuperado → o sistema cai no fallback de marca,
    // sem inventar endereço nem procedimento.
    expect(record.retrievedSources).toHaveLength(0);
    expect(record.reply).not.toMatch(/https?:\/\/nivelvelo\.com\/recuperar/);
  });
});
