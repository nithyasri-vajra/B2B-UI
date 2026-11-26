const maxExpandedBytes = 25 * 1024 * 1024;

async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (offset) => view.getUint16(offset, true);
  const long = (offset) => view.getUint32(offset, true);
  // The ZIP end record can be followed by a comment of at most 65,535 bytes.
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) &&
    (long(end) !== 0x06054b50 || end + 22 + word(end + 20) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557) || word(end + 4) || word(end + 6))
    throw new Error("Invalid ZIP directory");
  let offset = long(end + 16);
  let expanded = 0;
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let index = 0; index < word(end + 10); index++) {
    if (offset + 46 > end || long(offset) !== 0x02014b50) throw new Error("Invalid ZIP entry");
    const nameLength = word(offset + 28);
    const size = long(offset + 24);
    const compressed = long(offset + 20);
    const local = long(offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    expanded += size;
    if (expanded > maxExpandedBytes || word(offset + 8) & 1 || entries.has(name))
      throw new Error("Unsupported ZIP entry");
    if (local + 30 > bytes.length || long(local) !== 0x04034b50)
      throw new Error("Invalid ZIP entry location");
    const start = local + 30 + word(local + 26) + word(local + 28);
    if (start + compressed > bytes.length) throw new Error("Incomplete ZIP entry");
    entries.set(name, { size, method: word(offset + 10), data: bytes.subarray(start, start + compressed) });
    offset += 46 + nameLength + word(offset + 30) + word(offset + 32);
  }
  return async (name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error("Missing workbook part");
    if (entry.method === 0 && entry.data.length === entry.size) return decoder.decode(entry.data);
    if (entry.method !== 8) throw new Error("Unsupported ZIP compression");
    const reader = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    let total = 0;
    let xml = "";
    const streamDecoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > entry.size) throw new Error("Workbook part exceeds its declared size");
        xml += streamDecoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    if (total !== entry.size) throw new Error("Incomplete workbook part");
    return xml + streamDecoder.decode();
  };
}

const elements = (node, name) => Array.from(node.getElementsByTagNameNS("*", name));
const text = (node, name) => elements(node, name)[0]?.textContent;
const richText = (node) => elements(node, "t")
  .filter((part) => part.parentElement.localName !== "rPh").map((part) => part.textContent).join("");

export async function readWorkbook(file) {
  const read = await readZip(new Uint8Array(await file.arrayBuffer()));
  async function xml(path) {
    const source = await read(path);
    if (/<!DOCTYPE/i.test(source)) throw new Error("Unsupported workbook XML");
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (elements(doc, "parsererror").length) throw new Error("Invalid workbook XML");
    return doc;
  }
  const packageLinks = await xml("_rels/.rels");
  const workbookLink = elements(packageLinks, "Relationship")
    .find((link) => link.getAttribute("Type").endsWith("/officeDocument"));
  const workbookUrl = new URL(workbookLink.getAttribute("Target"), "https://workbook.invalid/");
  const partPath = (url) => decodeURIComponent(url.pathname.slice(1));
  const workbook = await xml(partPath(workbookUrl));
  const linksUrl = new URL("_rels/" + workbookUrl.pathname.split("/").at(-1) + ".rels", workbookUrl);
  const links = elements(await xml(partPath(linksUrl)), "Relationship");
  function target(link) {
    const url = new URL(link.getAttribute("Target"), workbookUrl);
    if (url.origin !== "https://workbook.invalid") throw new Error("External workbook part");
    return partPath(url);
  }
  const date1904 = ["1", "true"].includes(elements(workbook, "workbookPr")[0]?.getAttribute("date1904"));
  const sheets = new Map(elements(workbook, "sheet").map((sheet) => [
    sheet.getAttribute("name").trim().toLowerCase(),
    Array.from(sheet.attributes).find((attribute) => attribute.localName === "id")?.value,
  ]));

  const sharedLink = links.find((link) => link.getAttribute("Type").endsWith("/sharedStrings"));
  const strings = sharedLink ? elements(await xml(target(sharedLink)), "si").map(richText) : [];
  function cellValue(cell) {
    const type = cell.getAttribute("t");
    const value = text(cell, "v");
    if (type === "inlineStr") return richText(cell);
    if (value === undefined || type === "e") return null;
    if (type === "s") return strings[Number(value)] ?? null;
    if (type === "b") return value === "1";
    if (type === "n" || !type) return Number(value);
    return value;
  }
  const tabs = new Map();
  for (const name of ["1 period brief", "2 content focus", "3 kpi & target"]) {
    if (!sheets.has(name)) continue;
    const link = links.find((item) => item.getAttribute("Id") === sheets.get(name));
    const sheet = await xml(target(link));
    tabs.set(name, elements(sheet, "row").map((row, index) => ({
      number: Number(row.getAttribute("r") || index + 1),
      cells: Object.fromEntries(elements(row, "c").map((cell) => [
        cell.getAttribute("r").match(/^[A-Z]+/)[0], cellValue(cell),
      ])),
    })));
  }
  return { tabs, date1904 };
}
