import path from "node:path";
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { Document } from "@langchain/core/documents";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { subscriptionKnowledgeIndex } from "./pinecone.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDocument(document: Document): Document {
  const lines = document.pageContent.split("\n");

  function getField(label: string): string {
    const line = lines.find((line) =>
      line.startsWith(`${label}:`)
    );

    return line
      ? line.slice(`${label}:`.length).trim()
      : "";
  }

  const serviceName = getField("Service");
  const topic = getField("Topic");
  const sourceUrl = getField("Source");
  const additionalSourceUrl = getField("Additional source");
  const retrievedAt = getField("Retrieved at");

  const content = lines
    .filter((line) => {
      return (
        !line.startsWith("Service:") &&
        !line.startsWith("Topic:") &&
        !line.startsWith("Source:") &&
        !line.startsWith("Additional source:") &&
        !line.startsWith("Retrieved at:")
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return new Document({
    pageContent: content,
    metadata: {
      filePath: document.metadata.source,
      serviceName,
      topic,
      sourceUrl,
      retrievedAt,
      ...(additionalSourceUrl && {
        additionalSourceUrl,
      }),
    },
  });
}

async function buildKnowledgeRecords() {
  const knowledgePath = path.resolve(
    process.cwd(),
    "../knowledge"
  );

  const loader = new DirectoryLoader(knowledgePath, {
    ".md": (filePath) => new TextLoader(filePath),
  });

  // 读取44份Markdown
  const documents = await loader.load();

  // 把文档开头的字段转换成metadata
  const parsedDocuments = documents.map(parseDocument);

  // 把文档切分成chunks
  const splitter = new MarkdownTextSplitter({
    chunkSize: 800,
    chunkOverlap: 100,
  });

  const chunks = await splitter.splitDocuments(
    parsedDocuments
  );

  // 记录同一份文件已经处理了多少个chunks
  const chunkCounts = new Map<string, number>();

  // 将LangChain Documents转换成Pinecone records
  const records = chunks.map((chunk) => {
    const filePath = String(chunk.metadata.filePath);

    const chunkIndex =
      chunkCounts.get(filePath) ?? 0;

    chunkCounts.set(filePath, chunkIndex + 1);

    const serviceName = String(
      chunk.metadata.serviceName
    );

    const topic = String(chunk.metadata.topic);

    const documentId =
      `${slugify(serviceName)}-${slugify(topic)}`;

    return {
      _id: `${documentId}-${chunkIndex}`,

      // text会被Pinecone转换为embedding
      text: chunk.pageContent,

      // 以下字段会成为metadata
      documentId,
      serviceName,
      topic,
      sourceUrl: String(chunk.metadata.sourceUrl),
      retrievedAt: String(chunk.metadata.retrievedAt),
      chunkIndex,

      ...(chunk.metadata.additionalSourceUrl && {
        additionalSourceUrl: String(
          chunk.metadata.additionalSourceUrl
        ),
      }),
    };
  });

  console.log("Loaded documents:", documents.length);
  console.log("Generated records:", records.length);
  console.log("First record:", records[0]);

  return records;
}

async function ingestKnowledge() {
  const records = await buildKnowledgeRecords();

  const namespace =
    subscriptionKnowledgeIndex.namespace(
      "knowledge-v1"
    );

  await namespace.upsertRecords({records});

  console.log(
    `Uploaded ${records.length} records to knowledge-v1`
  );
}

async function main() {
  try {
    await ingestKnowledge();
  } catch (error) {
    console.error(error);
  }
}

main();