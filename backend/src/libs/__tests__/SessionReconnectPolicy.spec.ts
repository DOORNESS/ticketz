import {
  classifyDisconnect,
  conflictBackoffMs,
  nextBackoffMs
} from "../SessionReconnectPolicy";

const boom = (statusCode: number, message: string) => ({
  isBoom: true,
  output: { statusCode, payload: { statusCode, message } }
});

describe("classifyDisconnect", () => {
  it("428 transitório sem logout: reconecta e preserva credenciais", () => {
    // Payload real de produção: 19.383 ocorrências deste caso foram tratadas
    // como "QR expirado", forçando novo pareamento sem motivo.
    const result = classifyDisconnect(428, boom(428, "Connection Terminated"));

    expect(result.action).toBe("reconnect");
    expect(result.reason).toBe("connection_closed");
    expect(result.clearCredentials).toBe(false);
  });

  it("401 logout real: limpa credenciais e exige novo QR", () => {
    const result = classifyDisconnect(401, boom(401, "Logged Out"));

    expect(result.action).toBe("logout");
    expect(result.reason).toBe("logged_out");
    expect(result.clearCredentials).toBe(true);
  });

  it("403 proibido: também exige novo pareamento", () => {
    expect(classifyDisconnect(403, boom(403, "Forbidden"))).toMatchObject({
      action: "logout",
      clearCredentials: true
    });
  });

  it("credencial corrompida (500 badSession) exige novo QR", () => {
    expect(classifyDisconnect(500, boom(500, "Bad Session"))).toMatchObject({
      action: "logout",
      reason: "bad_session",
      clearCredentials: true
    });
  });

  it("440 / conflito: reconecta sem apagar credencial", () => {
    expect(
      classifyDisconnect(440, boom(440, "Connection Replaced"))
    ).toMatchObject({
      action: "conflict",
      clearCredentials: false
    });
    expect(
      classifyDisconnect(undefined, "Stream Errored (conflict)")
    ).toMatchObject({ action: "conflict", clearCredentials: false });
  });

  it("408 e 515 são transitórios", () => {
    expect(classifyDisconnect(408, boom(408, "Connection Lost"))).toMatchObject(
      {
        action: "reconnect",
        clearCredentials: false
      }
    );
    expect(
      classifyDisconnect(515, boom(515, "Restart Required"))
    ).toMatchObject({
      action: "reconnect",
      clearCredentials: false
    });
  });

  it("status desconhecido erra para o lado seguro: nunca apaga credencial", () => {
    const result = classifyDisconnect(599, boom(599, "Whatever"));
    expect(result.action).toBe("reconnect");
    expect(result.clearCredentials).toBe(false);

    const semStatus = classifyDisconnect(undefined, "");
    expect(semStatus.action).toBe("reconnect");
    expect(semStatus.clearCredentials).toBe(false);
  });

  it("nenhum status transitório pede limpeza de credencial", () => {
    [408, 428, 440, 515, 599].forEach(code => {
      expect(classifyDisconnect(code, boom(code, "x")).clearCredentials).toBe(
        false
      );
    });
  });
});

describe("nextBackoffMs", () => {
  it("cresce progressivamente e satura no teto", () => {
    expect(nextBackoffMs(1)).toBe(5000);
    expect(nextBackoffMs(2)).toBe(10000);
    expect(nextBackoffMs(3)).toBe(20000);
    expect(nextBackoffMs(4)).toBe(40000);
    expect(nextBackoffMs(5)).toBe(60000);
    expect(nextBackoffMs(20)).toBe(60000);
  });

  it("vários fechamentos em sequência não voltam para o começo", () => {
    const esperas = [1, 2, 3, 4].map(n => nextBackoffMs(n));
    const crescente = esperas.every((v, i) => i === 0 || v > esperas[i - 1]);
    expect(crescente).toBe(true);
  });

  it("tentativa inválida cai na primeira espera", () => {
    expect(nextBackoffMs(0)).toBe(5000);
    expect(nextBackoffMs(-3)).toBe(5000);
    expect(nextBackoffMs(NaN)).toBe(5000);
  });

  it("conflito espera mais que queda comum", () => {
    expect(conflictBackoffMs(1)).toBeGreaterThan(nextBackoffMs(1));
    expect(conflictBackoffMs(1)).toBe(15000);
    expect(conflictBackoffMs(10)).toBe(120000);
  });
});

describe("ciclo open → close → reconexão", () => {
  // Simula o contador de tentativas do wbot.ts: incrementa a cada close,
  // zera quando a conexão abre.
  const criarContador = () => {
    let attempt = 0;
    return {
      onClose: () => {
        attempt += 1;
        return nextBackoffMs(attempt);
      },
      onOpen: () => {
        attempt = 0;
      },
      get valor() {
        return attempt;
      }
    };
  };

  it("conexão que abre e depois recebe 428 recomeça o backoff do início", () => {
    const c = criarContador();

    expect(c.onClose()).toBe(5000);
    expect(c.onClose()).toBe(10000);

    c.onOpen(); // reconexão bem-sucedida
    expect(c.valor).toBe(0);

    // novo 428 depois de aberta volta para a primeira espera
    expect(c.onClose()).toBe(5000);
  });

  it("sequência de fechamentos sem abrir escala até o teto", () => {
    const c = criarContador();
    const esperas = Array.from({ length: 6 }, () => c.onClose());
    expect(esperas).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
  });
});

describe("timer duplicado", () => {
  // Espelha cancelSessionRestart + sessionRestartTimers do wbot.ts: cada
  // conexão pode ter no máximo um restart agendado.
  const criarAgendador = () => {
    const timers = new Map<number, string>();
    return {
      cancel: (id: number) => timers.delete(id),
      schedule(id: number, label: string) {
        this.cancel(id);
        timers.set(id, label);
      },
      timers
    };
  };

  it("agendar duas vezes deixa apenas o restart mais recente", () => {
    const a = criarAgendador();
    a.schedule(1, "primeiro");
    a.schedule(1, "segundo");

    expect(a.timers.size).toBe(1);
    expect(a.timers.get(1)).toBe("segundo");
  });

  it("mantém isolamento entre Nível e WebG3", () => {
    const a = criarAgendador();
    a.schedule(1, "webg3");
    a.schedule(3, "nivel");
    a.schedule(1, "webg3-novo");

    expect(a.timers.size).toBe(2);
    expect(a.timers.get(1)).toBe("webg3-novo");
    expect(a.timers.get(3)).toBe("nivel");

    a.cancel(1);
    expect(a.timers.get(3)).toBe("nivel");
  });
});
