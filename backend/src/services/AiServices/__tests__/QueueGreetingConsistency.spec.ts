import {
  detectQueueGreetingMismatches,
  queueNameCore
} from "../QueueGreetingConsistency";

const NIVEL_QUEUES = [
  {
    id: 1,
    name: "01 - Suporte Consumidor Nível",
    greetingMessage:
      "Olá! Você foi direcionado ao Suporte Consumidor Nível Cashback. Protocolo: 20260825-143"
  },
  {
    id: 2,
    name: "02 - Suporte Empresa Nível",
    greetingMessage:
      "Olá! Você foi direcionado ao Suporte Empresa Nível Cashback. Protocolo: 20260825-143"
  },
  {
    id: 3,
    name: "03 - Recuperar Conta Nível",
    // Copiado da fila 02 — é o caso real do print de 25/08.
    greetingMessage:
      "Olá! Você foi direcionado ao Suporte Empresa Nível Cashback. Protocolo: 20260825-143"
  }
];

describe("queueNameCore", () => {
  it("descarta o prefixo numérico de ordenação", () => {
    expect(queueNameCore("01 - Suporte Consumidor Nível")).toBe(
      "suporte consumidor nivel"
    );
    expect(queueNameCore("03 — Recuperar Conta Nível")).toBe(
      "recuperar conta nivel"
    );
    expect(queueNameCore("Suporte Fortmax")).toBe("suporte fortmax");
  });
});

describe("fila que anuncia outra fila", () => {
  it("pega a saudação copiada da fila errada", () => {
    const mismatches = detectQueueGreetingMismatches(NIVEL_QUEUES);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      queueId: 3,
      announcedQueueId: 2
    });
  });

  it("não acusa quando cada fila se nomeia corretamente", () => {
    const corrigidas = NIVEL_QUEUES.map(queue =>
      queue.id === 3
        ? {
            ...queue,
            greetingMessage:
              "Olá! Você foi direcionado ao Recuperar Conta Nível Cashback."
          }
        : queue
    );

    expect(detectQueueGreetingMismatches(corrigidas)).toEqual([]);
  });

  it("fila sem saudação não gera alarme", () => {
    expect(
      detectQueueGreetingMismatches([
        { id: 1, name: "01 - Suporte Consumidor Nível", greetingMessage: "" },
        { id: 2, name: "02 - Suporte Empresa Nível", greetingMessage: null }
      ])
    ).toEqual([]);
  });

  it("saudação genérica, sem citar fila nenhuma, não gera alarme", () => {
    expect(
      detectQueueGreetingMismatches([
        {
          id: 1,
          name: "01 - Suporte Consumidor Nível",
          greetingMessage: "Olá! Em que podemos ajudar?"
        },
        {
          id: 2,
          name: "02 - Suporte Empresa Nível",
          greetingMessage: "Olá! Em que podemos ajudar?"
        }
      ])
    ).toEqual([]);
  });

  it("citar outra fila de passagem não conta, se a própria estiver nomeada", () => {
    expect(
      detectQueueGreetingMismatches([
        {
          id: 1,
          name: "01 - Suporte Consumidor Nível",
          greetingMessage:
            "Você está no Suporte Consumidor Nível. Se o assunto for da sua empresa, volte ao menu e escolha Suporte Empresa Nível."
        },
        {
          id: 2,
          name: "02 - Suporte Empresa Nível",
          greetingMessage: "Você está no Suporte Empresa Nível."
        }
      ])
    ).toEqual([]);
  });

  it("nome curto demais não vira critério — evita alarme falso", () => {
    expect(
      detectQueueGreetingMismatches([
        { id: 1, name: "Vendas", greetingMessage: "Olá! Falamos de suporte." },
        { id: 2, name: "Suporte", greetingMessage: "Olá! Falamos de vendas." }
      ])
    ).toEqual([]);
  });
});
