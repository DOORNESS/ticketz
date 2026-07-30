import { buildContextualRetrievalQuery } from "../ContextualRetrievalQuery";

describe("buildContextualRetrievalQuery", () => {
  it("uses recent customer context to resolve a short follow-up", () => {
    const query = buildContextualRetrievalQuery("Qual é o site?", [
      {
        role: "user",
        content: "Quero saber como posso me tornar um cliente Nível"
      },
      {
        role: "assistant",
        content: "Você pode fazer o cadastro no site oficial."
      }
    ]);

    expect(query).toContain("me tornar um cliente Nível");
    expect(query).toContain("Qual é o site?");
    expect(query).not.toContain("fazer o cadastro no site oficial");
  });
});
