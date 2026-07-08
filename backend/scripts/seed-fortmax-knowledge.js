"use strict";
/**
 * Popula a base de conhecimento "Site" com conteúdo institucional Fortmax
 * e gera embeddings (OpenAI). Uso ops:
 *   node scripts/seed-fortmax-knowledge.js
 */
require("../dist/bootstrap");
require("../dist/database");

const KnowledgeBase = require("../dist/models/KnowledgeBase").default;
const KnowledgeDocument = require("../dist/models/KnowledgeDocument").default;
const {
  ingestKnowledgeDocument
} = require("../dist/services/AiServices/IngestKnowledgeDocumentService");

const COMPANY_ID = 1;
const KB_NAME = "Site";
const DOC_TITLE = "Fortmax Sistemas — Site Institucional";

const FORTMAX_CONTENT = `
# Fortmax Sistemas — Informações Institucionais

## Quem somos
A Fortmax Sistemas está no mercado desde 1998, com mais de 20 anos de experiência e mais de 5.000 indústrias atendidas em todo o Brasil.
Desenvolvemos software completo para indústrias de Esquadrias de Alumínio e Vidro Temperado.
Sede: R. Rubião Júnior, 619 — Centro, São José do Rio Preto - SP, CEP 15010-090.
CEO: Fernando Tarin.

## Missão
Agregar tecnologia em todas as áreas da empresa — ferramenta de venda e de alcance de clientes.
Investimos constantemente em novas tecnologias para garantir segurança e satisfação dos clientes.

## Produtos principais

### WebG3 (nuvem — webg3.com.br)
- Primeiro software online para o segmento industrial de esquadrias e vidro temperado.
- Sistema completo para cálculo de esquadrias de alumínio e vidro temperado.
- Mais de 3.000 projetos prontos disponíveis; personalização total para cada empresa.
- Otimização bidimensional com aproveitamento superior a 98% das chapas.
- 100% em nuvem — acesse de qualquer dispositivo (computador, tablet ou celular).
- Backups diários em dois datacenters (Brasil e Estados Unidos).
- Relatórios precisos para vendas, produção, corte e montagem.
- Orçamentos rápidos, cálculos precisos, três métodos de otimização personalizados.

### FortControl
- Software financeiro integrado aos demais sistemas Fortmax.

### SISTEMP (desktop)
- Software de cálculo desktop para Vidro Temperado.

### SCEA (desktop)
- Software de cálculo desktop para Esquadrias de Alumínio.

## Diferenciais
- Ampla quantidade de projetos e linhas de perfil disponíveis.
- Agilidade nos orçamentos para não perder vendas.
- Exatidão nos cálculos para reduzir desperdício e retrabalho.
- Ferramentas para corte, usinagem, PCP, estoque e financeiro integrados.
- Suporte via WhatsApp para dúvidas, vendas e demonstrações.

## Horário e atendimento
- Assistente virtual disponível 24 horas.
- Atendimento humano em dias úteis, das 8h às 18h (horário comercial).
- Para falar com atendente humano: diga "quero falar com atendente" ou "suporte humano".
- Assuntos financeiros e cobrança: solicite transferência para "financeiro" ou atendente humano.

## Contato
- Site: fortmax.com.br
- WebG3: webg3.com.br
- WhatsApp de suporte disponível neste canal.
- Equipe responde solicitações de contato em até 1 dia útil.

## Perguntas frequentes

Pergunta: Há quanto tempo a Fortmax existe?
Resposta: Desde 1998 — mais de 20 anos de mercado.

Pergunta: Quantas indústrias a Fortmax atende?
Resposta: Mais de 5.000 indústrias atendidas.

Pergunta: O que é o WebG3?
Resposta: Sistema em nuvem da Fortmax para cálculo de esquadrias de alumínio e vidro temperado, considerado um dos mais rápidos do mercado para serralheria e vidraçaria.

Pergunta: O WebG3 funciona no celular?
Resposta: Sim, é 100% online e pode ser acessado de qualquer dispositivo com internet.

Pergunta: Como pedir demonstração do WebG3?
Resposta: Peça uma demonstração por este WhatsApp ou acesse webg3.com.br.

Pergunta: A Fortmax só vende software de cálculo?
Resposta: Não. Além do cálculo, oferecemos ferramentas para corte, usinagem, PCP, estoque, financeiro (FortControl) e suporte contínuo.
`.trim();

const run = async () => {
  let kb = await KnowledgeBase.findOne({
    where: { companyId: COMPANY_ID, name: KB_NAME }
  });

  if (!kb) {
    kb = await KnowledgeBase.create({
      companyId: COMPANY_ID,
      name: KB_NAME,
      description: "Conteúdo institucional fortmax.com.br",
      active: true
    });
    console.log("Created knowledge base:", kb.id);
  }

  let doc = await KnowledgeDocument.findOne({
    where: { companyId: COMPANY_ID, title: DOC_TITLE }
  });

  if (!doc) {
    doc = await KnowledgeDocument.create({
      companyId: COMPANY_ID,
      knowledgeBaseId: kb.id,
      title: DOC_TITLE,
      type: "text",
      originalFilename: "fortmax-site.txt",
      storageUrl: "seed://fortmax-site",
      status: "pending"
    });
    console.log("Created document:", doc.id);
  } else {
    await doc.update({ status: "pending", knowledgeBaseId: kb.id });
    console.log("Re-ingesting document:", doc.id);
  }

  await ingestKnowledgeDocument(doc.id, COMPANY_ID, FORTMAX_CONTENT);
  await doc.reload();

  console.log(
    JSON.stringify({
      ok: true,
      knowledgeBaseId: kb.id,
      documentId: doc.id,
      status: doc.status
    })
  );
  process.exit(0);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
