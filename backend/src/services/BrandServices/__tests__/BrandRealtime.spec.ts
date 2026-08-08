/**
 * Isolamento em tempo real.
 *
 * A pergunta que estes testes respondem: com a API HTTP corretamente
 * protegida, ainda dá para vazar por websocket?
 *
 * Dois caminhos independentes precisam segurar:
 *   1. `joinChatBox` — acesso direto ao canal de um ticket, por id.
 *   2. salas de fila — o broadcast que entrega create/update/message.
 *
 * O gate dos dois é `canViewTicket`, que lê `user.brands`. O bug que motivou
 * este arquivo era o socket carregar o usuário sem `brands`: o gate passava
 * batido justamente onde ninguém olha.
 */
import Ticket from "../../../models/Ticket";
import User from "../../../models/User";
import canViewTicket from "../../../helpers/canViewTicket";
import { socketQueuesForUser } from "../../../helpers/socketBrandScope";

const NIVEL = 10;
const FORTMAX = 20;

const asUser = (over: Record<string, unknown> = {}): User =>
  ({
    id: 7,
    profile: "user",
    super: false,
    companyId: 1,
    queues: [],
    brands: [],
    ...over
  }) as unknown as User;

const asTicket = (over: Record<string, unknown> = {}): Ticket =>
  ({
    id: 1,
    companyId: 1,
    status: "pending",
    userId: null,
    queueId: 100,
    brandId: NIVEL,
    aiAgentId: null,
    aiHandoff: false,
    aiPaused: false,
    ...over
  }) as unknown as Ticket;

describe("1-4. usuário somente Nível", () => {
  const user = asUser({
    brands: [{ id: NIVEL }],
    queues: [
      { id: 100, brandId: NIVEL },
      { id: 200, brandId: FORTMAX }
    ]
  });

  it("ticket Nível chega normalmente", () => {
    expect(canViewTicket(asTicket({ brandId: NIVEL }), user)).toBe(true);
  });

  it("ticket Fortmax NÃO chega por joinChatBox", () => {
    expect(canViewTicket(asTicket({ brandId: FORTMAX }), user)).toBe(false);
  });

  it("não entra na sala da fila Fortmax — sem broadcast", () => {
    const rooms = socketQueuesForUser(user).map(queue => queue.id);
    expect(rooms).toContain(100);
    expect(rooms).not.toContain(200);
  });

  it("todos os eventos do ciclo do ticket ficam barrados", () => {
    // create, update, nova mensagem, handoff, assumido e fechado passam pelo
    // mesmo gate — se um vazasse, vazariam todos.
    const fortmaxStates = [
      { status: "pending" },
      { status: "open" },
      { status: "open", userId: 99 },
      { status: "pending", aiHandoff: true, aiAgentId: 3 },
      { status: "closed" },
      { status: "open", aiAgentId: 3 }
    ];

    fortmaxStates.forEach(state => {
      expect(
        canViewTicket(asTicket({ ...state, brandId: FORTMAX }), user)
      ).toBe(false);
    });
  });

  it("aba IA: ticket de IA de outra marca não aparece", () => {
    const aiTicket = asTicket({
      brandId: FORTMAX,
      aiAgentId: 3,
      status: "open",
      userId: null
    });
    expect(canViewTicket(aiTicket, user)).toBe(false);
  });
});

describe("5-6. usuário Nível + Fortmax", () => {
  const user = asUser({
    brands: [{ id: NIVEL }, { id: FORTMAX }],
    queues: [
      { id: 100, brandId: NIVEL },
      { id: 200, brandId: FORTMAX }
    ]
  });

  it("recebe as duas marcas com o mesmo login", () => {
    expect(canViewTicket(asTicket({ brandId: NIVEL }), user)).toBe(true);
    expect(canViewTicket(asTicket({ brandId: FORTMAX }), user)).toBe(true);
  });

  it("entra nas salas das duas filas", () => {
    const rooms = socketQueuesForUser(user).map(queue => queue.id);
    expect(rooms).toEqual(expect.arrayContaining([100, 200]));
  });
});

describe("compatibilidade e admin", () => {
  it("usuário legado sem marca mantém as filas de sempre", () => {
    const legacy = asUser({
      brands: [],
      queues: [
        { id: 100, brandId: NIVEL },
        { id: 200, brandId: FORTMAX }
      ]
    });

    expect(socketQueuesForUser(legacy).map(q => q.id)).toEqual([100, 200]);
    expect(canViewTicket(asTicket({ brandId: FORTMAX }), legacy)).toBe(true);
  });

  it("admin recebe tudo", () => {
    const admin = asUser({ profile: "admin", brands: [{ id: NIVEL }] });
    expect(canViewTicket(asTicket({ brandId: FORTMAX }), admin)).toBe(true);
  });

  it("com isolamento ligado, sem vínculo não recebe nada", () => {
    const enforced = asUser({ brands: [], brandIsolationEnforced: true });
    expect(canViewTicket(asTicket({ brandId: NIVEL }), enforced)).toBe(false);
  });
});
