/**
 * Fila cuja saudação anuncia OUTRA fila.
 *
 * O menu numerado é montado por `verifyQueue` a partir do mesmo array que ele
 * exibe, então a escolha do cliente não se desalinha sozinha: `queues[3-1]` é
 * sempre a terceira opção mostrada. O que se desalinha é o texto — a saudação
 * de cada fila é escrita à mão em Administração → Filas, e copiar a de uma fila
 * para outra faz o cliente escolher "Recuperar Conta" e ler "Você foi
 * direcionado ao Suporte Empresa".
 *
 * O sintoma parece bug de roteamento e não é: o ticket vai para a fila certa e
 * só a mensagem mente. Por isso a checagem existe — sem ela, a única forma de
 * descobrir é um humano comparar as três saudações na tela.
 */

export type QueueGreetingInput = {
  id: number;
  name: string;
  greetingMessage?: string | null;
};

export type QueueGreetingMismatch = {
  queueId: number;
  queueName: string;
  announcedQueueId: number;
  announcedQueueName: string;
};

const normalize = (text: string): string =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * "01 - Suporte Consumidor Nível" → "suporte consumidor nivel".
 *
 * O prefixo numérico é ordenação operacional, não identidade: mantê-lo na
 * comparação faria toda saudação parecer divergente, porque ninguém escreve
 * "você foi direcionado ao 02 - Suporte Empresa".
 */
export const queueNameCore = (name: string): string =>
  normalize(name).replace(/^\d+\s*[-–—:.]\s*/, "");

/**
 * Nomes muito curtos ("suporte", "vendas") aparecem dentro de qualquer texto e
 * gerariam alarme falso constante. A checagem só vale para nome que identifica
 * a fila sozinho.
 */
const isDistinctiveEnough = (core: string): boolean =>
  core.length >= 12 && core.split(" ").length >= 2;

export const detectQueueGreetingMismatches = (
  queues: QueueGreetingInput[]
): QueueGreetingMismatch[] => {
  const cores = queues.map(queue => ({
    queue,
    core: queueNameCore(queue.name)
  }));

  const mismatches: QueueGreetingMismatch[] = [];

  cores.forEach(({ queue, core }) => {
    const greeting = normalize(queue.greetingMessage || "");
    if (!greeting) {
      return;
    }

    // A fila que se nomeia corretamente está certa, mesmo que cite outra de
    // passagem ("se preferir a fila X, volte ao menu").
    if (core && greeting.includes(core)) {
      return;
    }

    const announced = cores.find(
      other =>
        other.queue.id !== queue.id &&
        isDistinctiveEnough(other.core) &&
        greeting.includes(other.core)
    );

    if (announced) {
      mismatches.push({
        queueId: queue.id,
        queueName: queue.name,
        announcedQueueId: announced.queue.id,
        announcedQueueName: announced.queue.name
      });
    }
  });

  return mismatches;
};
