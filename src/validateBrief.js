import { readWorkbook } from "./readWorkbook.js";

const day = 86400000;

function asDate(value, date1904) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const serial = Math.floor(value);
    const date = new Date(epoch + (serial + (!date1904 && serial > 0 && serial < 60 ? 1 : 0)) * day);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  }
  const text = String(value).trim();
  const named = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i.exec(text);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = named ? months.indexOf(named[2].toLowerCase()) + 1 : 0;
  const iso = month
    ? named[3] + "-" + String(month).padStart(2, "0") + "-" + named[1].padStart(2, "0")
    : text.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/)?.[1];
  if (!iso) return null;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

export async function validateBrief(file, client) {
  const issues = [];
  const issue = (location, message) => issues.push({ severity: "Error", location, message });
  const fields = Object.create(null);
  const invalid = { validated: false, fields, issues };
  if (file.size > 5 * 1024 * 1024) {
    issue("Workbook", "Choose an .xlsx workbook no larger than 5 MB.");
    return invalid;
  }
  let workbook;
  try {
    workbook = await readWorkbook(file);
  } catch (error) {
    console.error("Could not read the Excel workbook:", error);
    issue("Workbook", "Could not read this workbook. Save it as a valid .xlsx and try again.");
    return invalid;
  }
  const { tabs, date1904 } = workbook;
  const brief = tabs.get("1 period brief");
  const focus = tabs.get("2 content focus");
  const kpi = tabs.get("3 kpi & target");
  const headerText = (value) => String(value ?? "").trim().toLowerCase();
  const answerHeader = (rows, fieldColumn, answerColumn) => rows?.find(({ cells }) =>
    headerText(cells[fieldColumn]) === "field" && headerText(cells[answerColumn]) === "your answer");
  const briefHeader = answerHeader(brief, "B", "E");
  const kpiHeader = answerHeader(kpi, "A", "D");
  const focusHeader = focus?.find(({ cells }) =>
    headerText(cells.B) === "content focus" && headerText(cells.H) === "planned posts");
  if (!briefHeader || !focusHeader || !kpiHeader) {
    issue("Workbook", "Use the LinkedIn Period Brief template available on this page.");
    return invalid;
  }

  const values = new Map();
  for (const { number, cells } of brief) {
    if (number <= briefHeader.number || typeof cells.A !== "number" || !cells.B) continue;
    const name = String(cells.B).trim();
    const value = cells.E;
    values.set(name.toLowerCase(), { name, value, location: "1 Period Brief!E" + number });
    if (value != null && String(value).trim()) fields[name] = value;
  }
  for (const { number, cells } of kpi) {
    if (number <= kpiHeader.number) continue;
    if (headerText(cells.A).startsWith("calculated")) break;
    if (!cells.A || cells.D == null || !String(cells.D).trim()) continue;
    fields["KPI & Target / " + cells.A] = cells.D;
  }
  for (const { number, cells } of focus) {
    if (number <= focusHeader.number || typeof cells.A !== "number" || !cells.B) continue;
    for (const column of ["B", "C", "D", "E", "F", "G", "H", "I"]) {
      const header = focusHeader.cells[column];
      if (header && cells[column] != null && String(cells[column]).trim())
        fields["Content Focus " + cells.A + " / " + header] = cells[column];
    }
  }

  function required(label, ...aliases) {
    for (const name of [label, ...aliases]) {
      const entry = values.get(name.toLowerCase());
      if (!entry) continue;
      if (entry.value != null && String(entry.value).trim()) return entry;
      issue(entry.location, "Enter " + label.toLowerCase() + ".");
      return null;
    }
    issue("1 Period Brief", "Add a field for " + label.toLowerCase() + ".");
    return null;
  }

  function match(label, expected, ...aliases) {
    const entry = required(label, ...aliases);
    if (entry && expected && String(entry.value).trim().toLowerCase() !== expected.trim().toLowerCase())
      issue(entry.location, label + " must match " + expected + ".");
  }

  function periodDate(label, ...aliases) {
    const entry = required(label, ...aliases);
    if (!entry) return null;
    const date = asDate(entry.value, date1904);
    if (!date) issue(entry.location, "Use an Excel date, DD-MMM-YYYY, or YYYY-MM-DD.");
    else fields[entry.name] = date;
    return { date, location: entry.location };
  }

  match("Brand", client.name.replace(/ \(Preview\)$/, ""));
  const channel = required("Channel");
  if (channel && client.channel) {
    const normalize = (value) => String(value).trim().toLowerCase().replace(/^linkedin company page$/, "linkedin");
    if (normalize(channel.value) !== normalize(client.channel))
      issue(channel.location, "Channel must match " + client.channel + ".");
  }
  required("Primary objective", "Objective");
  required("Target audience", "Audience");
  required("CTA priorities", "CTA priority", "Primary CTA", "CTA");

  const start = periodDate("Period start", "Period start date", "Start date");
  const end = periodDate("Period end", "Period end date", "End date");
  const hasPeriod = start?.date && end?.date;
  if (hasPeriod) {
    const days = (Date.parse(end.date) - Date.parse(start.date)) / day;
    if (days <= 0 || days > 92) issue(end.location, "End date must follow start date within 92 days.");
  }

  const posts = required("Planned post count");
  let postCount = null;
  if (posts) {
    const value = String(posts.value).trim();
    const count = Number(value);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
        Number.isInteger(count) && count >= 1 && count <= 40) postCount = count;
    else issue(posts.location, "Enter a whole number from 1 to 40.");
  }
  return { validated: !issues.length, fields, issues, period: hasPeriod ? start.date + " to " + end.date : null, postCount };
}
