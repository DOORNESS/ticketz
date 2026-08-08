import User from "../models/User";

export type SocketQueue = { id: number; brandId?: number | null };

/**
 * Filas em que o usuário pode receber eventos de socket.
 *
 * Vive fora de `libs/socket.ts` para poder ser testado sem levantar o
 * Socket.io e metade da aplicação junto — o teste importa esta função, e não
 * uma cópia da regra, para que os dois não possam divergir em silêncio.
 *
 * Um atendente restrito a uma marca não entra na sala de uma fila de outra
 * marca, mesmo que a fila esteja no cadastro dele: a marca é a autoridade.
 * Sem vínculo de marca, o comportamento antigo é preservado.
 */
export const socketQueuesForUser = (user: User): SocketQueue[] => {
  const queues = (user.queues || []) as unknown as SocketQueue[];

  if (user.profile === "admin" || user.super === true) {
    return queues;
  }

  const allowedBrandIds = (user.brands || []).map(brand => Number(brand.id));
  if (!allowedBrandIds.length) {
    return queues;
  }

  return queues.filter(
    queue => queue.brandId && allowedBrandIds.includes(Number(queue.brandId))
  );
};

export default socketQueuesForUser;
