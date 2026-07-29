import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE } from "./RagConfig";

export type StructuredPage = {
  pageNumber: number;
  text: string;
};

export type ChunkingOptions = {
  pages?: StructuredPage[];
  format?: string;
};

export type KnowledgeTextChunk = {
  content: string;
  metadata: Record<string, unknown>;
};

type Heading = {
  title: string;
  level: number;
};

const detectHeading = (paragraph: string): Heading | null => {
  const singleLine = paragraph.replace(/\s+/g, " ").trim();
  if (!singleLine || singleLine.length > 160 || paragraph.includes("\n")) {
    return null;
  }

  const markdown = singleLine.match(/^(#{1,6})\s+(.+)$/);
  if (markdown) {
    return { title: markdown[2].trim(), level: markdown[1].length };
  }

  const numbered = singleLine.match(/^(\d+(?:\.\d+){0,5})[.)]?\s+(.+)$/);
  if (numbered) {
    return {
      title: `${numbered[1]} ${numbered[2]}`.trim(),
      level: numbered[1].split(".").length
    };
  }

  const letters = singleLine.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (
    letters.length >= 4 &&
    singleLine === singleLine.toUpperCase() &&
    !/[.!?]$/.test(singleLine)
  ) {
    return { title: singleLine, level: 1 };
  }

  return null;
};

const normalizePages = (
  text: string,
  pages?: StructuredPage[]
): StructuredPage[] => {
  if (pages?.length) {
    return pages
      .map(page => ({
        pageNumber: page.pageNumber,
        text: page.text.replace(/\r\n/g, "\n").trim()
      }))
      .filter(page => Boolean(page.text));
  }

  const normalized = text.replace(/\r\n/g, "\n").trim();
  const pageTexts = normalized.split(/\f+/).map(page => page.trim());
  const hasPageBreaks = pageTexts.length > 1;
  return pageTexts.filter(Boolean).map((pageText, index) => ({
    pageNumber: hasPageBreaks ? index + 1 : 0,
    text: pageText
  }));
};

const splitSemanticParagraphs = (text: string): string[] => {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    const paragraph = current.join("\n").trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
    current = [];
  };

  text.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    if (detectHeading(trimmed)) {
      flush();
      paragraphs.push(trimmed);
      return;
    }
    current.push(trimmed);
  });
  flush();
  return paragraphs;
};

export const splitTextIntoChunks = (
  text: string,
  options: ChunkingOptions = {}
): KnowledgeTextChunk[] => {
  const pages = normalizePages(text, options.pages);
  if (!pages.length) {
    return [];
  }

  const chunks: KnowledgeTextChunk[] = [];
  let chunkIndex = 0;
  let chapter = "";
  let section = "";
  let sectionLevel = 0;
  let globalOffset = 0;
  let paragraphIndex = 0;

  const appendChunk = ({
    content,
    pageNumber,
    paragraphStart,
    paragraphEnd,
    charStart
  }: {
    content: string;
    pageNumber: number;
    paragraphStart: number;
    paragraphEnd: number;
    charStart: number;
  }): void => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return;
    }

    let offset = 0;
    while (offset < normalizedContent.length) {
      const end = Math.min(offset + RAG_CHUNK_SIZE, normalizedContent.length);
      const slice = normalizedContent.slice(offset, end).trim();
      if (slice) {
        const pageMetadata =
          pageNumber > 0
            ? {
                page: pageNumber,
                pageStart: pageNumber,
                pageEnd: pageNumber
              }
            : {};
        chunks.push({
          content: slice,
          metadata: {
            chunkIndex,
            chunkingVersion: "structured-v2",
            format: options.format || "text",
            ...pageMetadata,
            ...(chapter ? { chapter } : {}),
            ...(section ? { section, sectionLevel } : {}),
            paragraphStart,
            paragraphEnd,
            charStart: charStart + offset,
            charEnd: charStart + end
          }
        });
        chunkIndex += 1;
      }

      if (end >= normalizedContent.length) {
        break;
      }
      offset = end - RAG_CHUNK_OVERLAP;
    }
  };

  pages.forEach(page => {
    const paragraphs = splitSemanticParagraphs(page.text);
    let buffer = "";
    let bufferStartParagraph = paragraphIndex;
    let bufferCharStart = globalOffset;

    const flush = (): void => {
      appendChunk({
        content: buffer,
        pageNumber: page.pageNumber,
        paragraphStart: bufferStartParagraph,
        paragraphEnd: Math.max(bufferStartParagraph, paragraphIndex - 1),
        charStart: bufferCharStart
      });
      buffer = "";
    };

    paragraphs.forEach(paragraph => {
      const heading = detectHeading(paragraph);
      if (heading) {
        flush();
        section = heading.title;
        sectionLevel = heading.level;
        if (heading.level === 1) {
          chapter = heading.title;
        }
      }

      const separator = buffer ? "\n\n" : "";
      if (
        buffer &&
        buffer.length + separator.length + paragraph.length > RAG_CHUNK_SIZE
      ) {
        flush();
      }

      if (!buffer) {
        bufferStartParagraph = paragraphIndex;
        bufferCharStart = globalOffset;
      }

      buffer += `${buffer ? "\n\n" : ""}${paragraph}`;
      globalOffset += paragraph.length + 2;
      paragraphIndex += 1;

      if (buffer.length >= RAG_CHUNK_SIZE) {
        flush();
      }
    });

    flush();
    globalOffset += 1;
  });

  return chunks;
};
