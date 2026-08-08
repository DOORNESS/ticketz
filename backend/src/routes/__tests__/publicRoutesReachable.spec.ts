import fs from "fs";
import path from "path";

/**
 * Rotas públicas precisam estar no router que é realmente servido.
 *
 * `server.ts` serve `appFast`, que monta `routes/heavyRoutes.ts`. O
 * `routes/index.ts` pertence ao `app.ts`, um Express que só existe para o
 * `server.ts` ler `get("queues")` — nada registrado lá responde requisição.
 *
 * Foi assim que o link público do chamado por e-mail (`/escalation/:token`)
 * ficou 404: o commit que o criou registrou em `index.ts` e ninguém percebeu,
 * porque o envio do e-mail continuava funcionando. Só o clique falhava.
 *
 * Este teste é de topologia, não de comportamento: lê os dois arquivos e
 * compara. É barato e pega a classe inteira do problema.
 */
const routesDir = path.resolve(__dirname, "..");

const read = (file: string): string =>
  fs.readFileSync(path.join(routesDir, file), "utf8");

const mountedIn = (source: string, varName: string): string[] => {
  const matches = source.match(
    new RegExp(`${varName}\\.use\\(([a-zA-Z]+)\\)`, "g")
  );
  return (matches || []).map(entry =>
    entry.replace(`${varName}.use(`, "").replace(")", "")
  );
};

/**
 * Montado fora do heavyRoutes de propósito: `settingRoutes` entra em
 * `ensureCoreRoutes()` no `appFast`, junto do login, porque precisa responder
 * antes das rotas de negócio carregarem.
 */
const MOUNTED_ELSEWHERE = ["settingRoutes"];

describe("topologia das rotas", () => {
  const heavy = read("heavyRoutes.ts");
  const index = read("index.ts");

  it("o link público de escalação responde no router servido", () => {
    expect(mountedIn(heavy, "heavyRoutes")).toContain("escalationRoutes");
  });

  it("nenhuma rota fica só no router morto", () => {
    const inHeavy = new Set(mountedIn(heavy, "heavyRoutes"));
    const orphans = mountedIn(index, "routes").filter(
      route => !inHeavy.has(route) && !MOUNTED_ELSEWHERE.includes(route)
    );

    expect(orphans).toEqual([]);
  });

  it("appFast monta heavyRoutes, e não routes/index", () => {
    const appFast = fs.readFileSync(
      path.resolve(routesDir, "..", "appFast.ts"),
      "utf8"
    );

    expect(appFast).toContain('import("./routes/heavyRoutes")');
    expect(appFast).not.toContain('import("./routes")');
  });
});
