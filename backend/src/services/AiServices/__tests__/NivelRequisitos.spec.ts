/**
 * Conformidade dos 11 itens pedidos para o atendimento da Nível Cashback.
 *
 * Cada `describe` abaixo é um item do pedido, com o sintoma real que o
 * originou. O objetivo não é cobrir implementação — isso já é feito em
 * `NivelAssistantPolicy.spec.ts` e `QueueGreetingConsistency.spec.ts` — e sim
 * deixar o REQUISITO executável, para que uma regressão futura apareça como
 * teste vermelho e não como print de conversa.
 */
import {
  buildAgentGreetingReply,
  buildAgentIdentityReply,
  buildAgentOperationalRules,
  resolveAgentExternalSupportReply
} from "../AgentPersonaService";
import {
  buildUnconfirmedEmailReply,
  detectUnconfirmedEmailBlock,
  NIVEL_EXECUTIVE_CONTACT,
  resolveNivelInterestReply,
  stripAssistantProperName
} from "../NivelAssistantPolicy";
import { detectQueueGreetingMismatches } from "../QueueGreetingConsistency";
import { NIVEL_PROMPT } from "../WireSupportLinesService";
import { __testing } from "../../BrandServices/BackfillBrandsService";
import { prepareCustomerFacingAiText } from "../prepareCustomerFacingAiText";

/** Agente como está gravado em produção: prompt legado, com o nome antigo. */
const agenteProducao = {
  name: "Nivelton",
  basePrompt:
    'Você é o Nivelton, assistente virtual da Nível Cashback. Quando perguntarem seu nome, responda: "Me chamo Nivelton, assistente da Nível Cashback."',
  brand: { slug: "nivel", supportContacts: [{ whatsapp: "17 99165-8811" }] }
} as never;

const regras = () => buildAgentOperationalRules(agenteProducao);
const sementeNivel = __testing.SEEDS.find(seed => seed.slug === "nivel");

describe("Item 1 — não se apresentar do nada no meio da conversa", () => {
  it('responder "Ok"/"Obrigado" não dispara auto-apresentação', () => {
    const resposta = buildAgentGreetingReply({
      agent: agenteProducao,
      alreadyGreeted: true
    });

    expect(resposta).toBe("Em que posso ajudar?");
    expect(resposta).not.toMatch(/me chamo|nivelton/i);
  });

  it("a frase exata do print 1 não sobrevive ao saneamento de saída", () => {
    const saida = prepareCustomerFacingAiText(
      "Me chamo Nivelton, assistente da Nível Cashback. Como posso ajudar você hoje?",
      "Obrigado",
      agenteProducao
    );

    expect(saida).not.toMatch(/nivelton/i);
    expect(saida).not.toMatch(/me chamo/i);
  });

  it("as regras da marca proíbem se apresentar em conversa em andamento", () => {
    expect(regras()).toMatch(/nunca no meio ou no fim de uma conversa/i);
    expect(regras()).toMatch(/ok.*obrigado|obrigado/i);
  });
});

describe("Item 2 — e-mail de cadastro não confirmado", () => {
  it("reconhece o aviso da tela de login (print 3)", () => {
    expect(
      detectUnconfirmedEmailBlock(
        "E-mail ainda não confirmado. Verifique sua caixa de entrada. enviar novamente"
      )
    ).toBe(true);
  });

  it('a orientação é clicar em "enviar novamente", não recuperar senha', () => {
    const resposta = buildUnconfirmedEmailReply();

    expect(resposta).toMatch(/enviar novamente/i);
    expect(resposta).toMatch(/spam|lixo eletr/i);
    expect(resposta).not.toMatch(/recuperar-senha/i);
  });

  it('não confunde com "não consigo acessar" genérico (print 2 sem o aviso)', () => {
    expect(
      detectUnconfirmedEmailBlock("Não estou conseguindo assesar meu app")
    ).toBe(false);
  });
});

describe("Item 3 — menu numerado e fila anunciada errada", () => {
  it("detecta a fila 03 cuja saudação anuncia a fila 02 (print 4)", () => {
    const divergencias = detectQueueGreetingMismatches([
      {
        id: 1,
        name: "01 - Suporte Consumidor Nível",
        greetingMessage:
          "Você foi direcionado ao Suporte Consumidor Nível Cashback."
      },
      {
        id: 2,
        name: "02 - Suporte Empresa Nível",
        greetingMessage:
          "Você foi direcionado ao Suporte Empresa Nível Cashback."
      },
      {
        id: 3,
        name: "03 - Recuperar Conta Nível",
        greetingMessage:
          "Você foi direcionado ao Suporte Empresa Nível Cashback."
      }
    ]);

    expect(divergencias).toHaveLength(1);
    expect(divergencias[0].queueId).toBe(3);
    expect(divergencias[0].announcedQueueId).toBe(2);
  });
});

describe("Itens 4 e 8 — assistente sem nome próprio", () => {
  it("a identidade não cita nome, mesmo com o prompt legado gravado", () => {
    const identidade = buildAgentIdentityReply(agenteProducao);

    expect(identidade).toMatch(/assistente virtual da Nível Cashback/i);
    expect(identidade).not.toMatch(/nivelton/i);
    expect(identidade).not.toMatch(/me chamo/i);
  });

  it("a semente do prompt não tem nome próprio", () => {
    expect(NIVEL_PROMPT).not.toMatch(/nivelton/i);
    expect(NIVEL_PROMPT).toMatch(/não tem nome próprio/i);
  });

  it("a semente da marca não tem nome próprio", () => {
    expect(sementeNivel?.identityName).not.toMatch(/nivelton/i);
    expect(sementeNivel?.identityReply).not.toMatch(/nivelton/i);
    expect(sementeNivel?.identityReply).toMatch(/assistente virtual/i);
  });

  it("a marca Nível continua intacta — some o nome, não a empresa", () => {
    const texto = stripAssistantProperName(
      "A Nível Cashback devolve parte do valor das suas compras.",
      "Nivelton"
    );

    expect(texto).toBe(
      "A Nível Cashback devolve parte do valor das suas compras."
    );
  });
});

describe("Itens 5, 6 e 7 — contato executivo só quando comprovado", () => {
  const contato = NIVEL_EXECUTIVE_CONTACT.whatsapp;

  it("item 5 — empresa própria recebe o contato", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "Olá! Tenho uma empresa e quero vender mais com a Nível."
    );

    expect(interest).toBe("own_business");
    expect(reply).toContain("Fernando Tarin");
    expect(reply).toContain(contato);
  });

  it("item 6 — executivo/franqueado recebe o mesmo contato", () => {
    [
      "quero ser franqueado da Nível",
      "quero divulgar a Nível na minha região"
    ].forEach(texto => {
      const { interest, reply } = resolveNivelInterestReply(texto);
      expect(interest).toBe("promoter");
      expect(reply).toContain(contato);
    });
  });

  it("item 7 — em nenhum outro caso o telefone sai", () => {
    [
      "Olá!! Quero saber mais sobre a Nível Cashback.",
      "quero comprar nas lojas e ganhar cashback",
      "sou consumidor, como funciona?",
      "não consigo entrar no app",
      "meu saldo está zerado",
      "bom dia"
    ].forEach(texto => {
      const { reply } = resolveNivelInterestReply(texto);
      expect(reply || "").not.toContain(contato);
    });
  });

  it("item 8 — interesse vago vira pergunta qualificadora, sem nome e sem telefone", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "Olá!! Quero saber mais sobre a Nível Cashback."
    );

    expect(interest).toBe("unknown");
    expect(reply).toMatch(/consumidor/i);
    expect(reply).toMatch(/sua empresa/i);
    expect(reply).toMatch(/divulgar/i);
    expect(reply).not.toMatch(/nivelton/i);
    expect(reply).not.toContain(contato);
  });
});

describe("Item 9 — nada de conselho genérico fora da base", () => {
  it("as regras proíbem marketing e redes sociais inventados", () => {
    expect(regras()).toMatch(/redes sociais/i);
    expect(regras()).toMatch(/e-?mail marketing/i);
    expect(regras()).toMatch(/boca a boca/i);
    expect(regras()).toMatch(/nunca dê conselho genérico/i);
  });

  it("as regras proíbem descrever telas e fluxos ausentes da base", () => {
    expect(regras()).toMatch(/telas, botões ou fluxos/i);
    expect(regras()).toMatch(/não invente o caminho/i);
  });
});

describe("Item 10 — estabelecimento físico ≠ grandes marcas", () => {
  it("as regras trazem os dois modelos e proíbem trocá-los", () => {
    const texto = regras();

    expect(texto).toMatch(/estabelecimento físico/i);
    expect(texto).toMatch(/saldo próprio/i);
    expect(texto).toMatch(/direto e na hora|imediat/i);
    expect(texto).toMatch(/grandes marcas/i);
    expect(texto).toMatch(/parceria comercial/i);
    expect(texto).toMatch(/confirmação da compra|prazo de pagamento/i);
    expect(texto).toMatch(/nunca troque um modelo pelo outro/i);
  });

  it("credenciamento é pela equipe comercial, não pelo aplicativo", () => {
    expect(regras()).toMatch(/equipe comercial/i);
    expect(regras()).toMatch(/não pelo aplicativo/i);
  });
});

describe("Regressão — o que já funcionava não pode quebrar", () => {
  it("pedido de humano na Nível continua indo para o WhatsApp da marca", () => {
    const resposta = resolveAgentExternalSupportReply(agenteProducao);

    expect(resposta).toMatch(/99165-8811/);
    expect(resposta).not.toMatch(/nivelvelo\.com\/chamado/i);
  });

  it("a Fortmax não é contaminada pela persona da Nível", () => {
    const fortmax = {
      name: "Webin",
      basePrompt: "Você é o Webin, assistente da Fortmax.",
      brand: { slug: "fortmax" }
    } as never;

    expect(buildAgentIdentityReply(fortmax)).toMatch(/Webin/);
    expect(buildAgentOperationalRules(fortmax)).not.toMatch(/nivelton|99165/i);
  });
});
