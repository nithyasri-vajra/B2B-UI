export const knowledgeFiles = [
  { name: "brand.md", domains: ["D1", "D3"] },
  { name: "claims.md", domains: ["D2"] },
  { name: "market.md", domains: ["D6"] },
  { name: "operations.md", domains: ["D4", "D5", "D7"] },
  { name: "learning.md", domains: ["D8"] },
];

export async function createKnowledgeFileRecord(file, clientId) {
  const knowledgeFile = knowledgeFiles.find(({ name }) => name === file.name.toLowerCase());
  if (!knowledgeFile) return null;

  const { name, domains } = knowledgeFile;
  return {
    id: JSON.stringify([clientId, name]),
    clientId,
    domain: domains[0],
    item: name,
    state: "Captured",
    review: true,
    reuse: "Internal only",
    statement: name,
    source: name,
    quote: await file.text(),
    wording: "",
    approved: null,
  };
}

export function previewKnowledgeReadiness(data, clientId) {
  const records = new Map(data.records
    .filter((record) => record.clientId === clientId)
    .map((record) => [record.item, record]));
  const files = knowledgeFiles.map(({ name }) => {
    const record = records.get(name);
    const approved = record?.state === "Approved" && !record.review;
    return { name, approved, status: approved ? "Approved" : (record?.state ?? "Missing") };
  });
  const gaps = files.filter(({ approved }) => !approved).map(({ name, status }) => ({
    id: name,
    name,
    reason: status === "Missing" ? "Upload this file in Knowledge setup." : "Approve this file in Knowledge records.",
  }));
  const prior = data.readiness.find((report) => report.clientId === clientId);
  return {
    clientId,
    preview: true,
    files,
    gaps,
    canPublish: gaps.length === 0,
    canStart: gaps.length === 0 && prior?.canStart === true,
  };
}
