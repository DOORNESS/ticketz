import {
  buildNivelIdentityReply,
  classifyNivelInterest,
  detectUnconfirmedEmailBlock,
  NIVEL_EXECUTIVE_CONTACT,
  resolveNivelInterestReply,
  stripAssistantProperName
} from "../NivelAssistantPolicy";

describe("identidade sem nome próprio", () => {
  it("não apresenta nome de pessoa", () => {
    const reply = buildNivelIdentityReply();
    expect(reply).toMatch(/assistente virtual/i);
    expect(reply).not.toMatch(/nivelton/i);
    expect(reply).not.toMatch(/me chamo/i);
  });

  it("remove a auto-apresentação que o prompt de produção ainda produz", () => {
    const saida = stripAssistantProperName(
      "Me chamo Nivelton, assistente da Nível Cashback. Como posso ajudar você hoje?",
      "Nivelton"
    );

    expect(saida).not.toMatch(/nivelton/i);
    expect(saida).toMatch(/assistente virtual da Nível Cashback/i);
    // A marca permanece — o que sai é o nome de pessoa.
    expect(saida).toMatch(/Nível Cashback/);
    expect(saida).toMatch(/ajudar/i);
  });

  it("remove menção solta sem picotar o resto da frase", () => {
    const saida = stripAssistantProperName(
      "O Nivelton pode te ajudar com o cashback.",
      "Nivelton"
    );

    expect(saida).not.toMatch(/nivelton/i);
    expect(saida).toMatch(/cashback/);
  });

  it("não confunde a marca Nível com o nome do assistente", () => {
    const saida = stripAssistantProperName(
      "A Nível Cashback devolve parte do valor das suas compras.",
      "Nivelton"
    );

    expect(saida).toBe(
      "A Nível Cashback devolve parte do valor das suas compras."
    );
  });
});

describe("e-mail de cadastro não confirmado", () => {
  it("reconhece o aviso da tela de login", () => {
    expect(
      detectUnconfirmedEmailBlock(
        "E-mail ainda não confirmado. Verifique sua caixa de entrada. enviar novamente"
      )
    ).toBe(true);
  });

  it("reconhece o cliente descrevendo o problema com as próprias palavras", () => {
    expect(
      detectUnconfirmedEmailBlock("acho que não confirmei o email do cadastro")
    ).toBe(true);
    expect(
      detectUnconfirmedEmailBlock("não recebi o email de confirmação")
    ).toBe(true);
  });

  it("não dispara em problema de acesso genérico", () => {
    expect(
      detectUnconfirmedEmailBlock("não estou conseguindo acessar meu app")
    ).toBe(false);
    expect(detectUnconfirmedEmailBlock("esqueci minha senha")).toBe(false);
  });
});

describe("qualificação do interesse na Nível", () => {
  it("empresa própria libera o contato executivo", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "Olá! Tenho uma empresa e quero vender mais com a Nível."
    );

    expect(interest).toBe("own_business");
    expect(reply).toContain(NIVEL_EXECUTIVE_CONTACT.name);
    expect(reply).toContain(NIVEL_EXECUTIVE_CONTACT.whatsapp);
  });

  it("quem quer divulgar a Nível também recebe o contato", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "quero ser representante da Nível na minha cidade"
    );

    expect(interest).toBe("promoter");
    expect(reply).toContain(NIVEL_EXECUTIVE_CONTACT.whatsapp);
  });

  it("'quero trazer para Santa Maria' é representação, não credenciamento", () => {
    expect(
      classifyNivelInterest("Quero trazer a Nível para minha cidade")
    ).toBe("promoter");
  });

  it("consumidor final NÃO recebe o contato", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "quero comprar nas lojas e ganhar cashback"
    );

    expect(interest).toBe("consumer");
    expect(reply).toBeNull();
  });

  it("interesse vago vira pergunta, nunca telefone", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "Olá!! Quero saber mais sobre a Nível Cashback."
    );

    expect(interest).toBe("unknown");
    expect(reply).not.toBeNull();
    expect(reply).not.toContain(NIVEL_EXECUTIVE_CONTACT.whatsapp);
    expect(reply).toMatch(/consumidor/i);
    expect(reply).toMatch(/sua empresa/i);
    expect(reply).toMatch(/divulgar/i);
  });

  it("conversa que não é sobre conhecer a Nível fica de fora", () => {
    const { interest, reply } = resolveNivelInterestReply(
      "não consigo entrar no aplicativo"
    );

    expect(interest).toBe("none");
    expect(reply).toBeNull();
  });

  it("o contato só sai nos dois casos comprovados", () => {
    const casos = [
      "quero saber mais sobre a nível",
      "quero comprar e ganhar cashback",
      "meu saldo está zerado",
      "bom dia"
    ];

    casos.forEach(texto => {
      const { reply } = resolveNivelInterestReply(texto);
      expect(reply || "").not.toContain(NIVEL_EXECUTIVE_CONTACT.whatsapp);
    });
  });
});
