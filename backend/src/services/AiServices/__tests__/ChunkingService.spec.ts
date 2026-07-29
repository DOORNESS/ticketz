import { splitTextIntoChunks } from "../ChunkingService";
import { RAG_CHUNK_SIZE } from "../RagConfig";

describe("ChunkingService structured-v2", () => {
  it("chunks by headings and paragraphs with chapter metadata", () => {
    const chunks = splitTextIntoChunks(
      [
        "# Implantação",
        "",
        "Este capítulo apresenta a implantação do sistema.",
        "",
        "## Configuração inicial",
        "",
        "Configure a empresa e depois vincule a conexão."
      ].join("\n"),
      { format: "markdown" }
    );

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every(chunk => chunk.content.length <= RAG_CHUNK_SIZE)).toBe(
      true
    );
    expect(chunks[0].metadata).toMatchObject({
      chunkingVersion: "structured-v2",
      chapter: "Implantação",
      section: "Implantação",
      sectionLevel: 1,
      format: "markdown"
    });
    expect(
      chunks.some(chunk => chunk.metadata.section === "Configuração inicial")
    ).toBe(true);
  });

  it("preserves PDF page metadata", () => {
    const chunks = splitTextIntoChunks("conteúdo completo", {
      format: "pdf",
      pages: [
        { pageNumber: 7, text: "CAPÍTULO FINANCEIRO\n\nRegras do boleto." },
        { pageNumber: 8, text: "SUPORTE\n\nProcedimento de acesso." }
      ]
    });

    expect(chunks.map(chunk => chunk.metadata.page)).toEqual([7, 8]);
    expect(chunks[0].metadata.chapter).toBe("CAPÍTULO FINANCEIRO");
    expect(chunks[1].metadata.chapter).toBe("SUPORTE");
  });

  it("keeps overlap only for oversized semantic blocks", () => {
    const text = "A".repeat(RAG_CHUNK_SIZE + 300);
    const chunks = splitTextIntoChunks(text);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toHaveLength(RAG_CHUNK_SIZE);
    expect(chunks[1].metadata.charStart).toBe(RAG_CHUNK_SIZE - 200);
  });
});
