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
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(named[2].toLowerCase()) + 1;
    if (!month) return null;
    return asDate(named[3] + "-" + String(month).padStart(2, "0") + "-" + named[1].padStart(2, "0"), date1904);
  }
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/)?.[1];
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
  const { sheets, tabs, date1904 } = workbook;
  const normalize = (value) => String(value ?? "").trim().toLowerCase();
  function header(rows, ...labels) {
    for (const row of rows ?? []) {
      const columns = labels.map((label) =>
        Object.keys(row.cells).find((column) => normalize(row.cells[column]) === label));
      if (columns.every(Boolean)) return { ...row, columns };
    }
  }

  const modern = tabs.has("1 period brief");
  const briefName = modern ? "1 Period Brief" : "Brief";
  const briefRows = tabs.get(briefName.toLowerCase());
  const briefHeader = header(briefRows, "field", modern ? "your answer" : "value");
  const kpiRows = tabs.get("3 kpi & target");
  const kpiHeader = modern && header(kpiRows, "field", "your answer");
  const focusRows = tabs.get("2 content focus");
  const focusHeader = modern && header(focusRows, "content focus", "planned posts");
  if (!briefHeader || (modern && (!kpiHeader || !focusHeader))) {
    issue("Workbook", modern
      ? "Check the Field and Your answer headers on the Period Brief and KPI tabs, and the Content Focus headers."
      : "Add a Brief sheet with Field and Value columns.");
    return invalid;
  }

  const values = new Map();
  const [fieldColumn, answerColumn] = briefHeader.columns;
  for (const { number, cells } of briefRows) {
    if (number <= briefHeader.number) continue;
    const name = String(cells[fieldColumn] ?? "").trim();
    const key = normalize(name);
    if (!key || key === "field") continue;
    if (values.has(key)) {
      issue(briefName + "!" + fieldColumn + number, "Duplicate field: " + name + ".");
      continue;
    }
    const value = cells[answerColumn];
    values.set(key, { name, value, location: briefName + "!" + answerColumn + number });
    if (value != null) fields[name] = value;
  }

  if (modern) {
    const [metricColumn, metricAnswerColumn] = kpiHeader.columns;
    for (const { number, cells } of kpiRows) {
      if (number <= kpiHeader.number) continue;
      const name = String(cells[metricColumn] ?? "").trim();
      if (normalize(name).startsWith("calculated")) break;
      const value = cells[metricAnswerColumn];
      if (name && normalize(value)) fields["KPI & Target / " + name] = value;
    }
    const [topicColumn] = focusHeader.columns;
    const focusColumns = Object.entries(focusHeader.cells).filter(([, name]) =>
      ["content focus", "pillar", "intended audience", "key message", "cta",
        "preferred format", "planned posts", "priority"].includes(normalize(name)));
    let focusNumber = 0;
    for (const { number, cells } of focusRows) {
      if (number <= focusHeader.number || !normalize(cells[topicColumn])) continue;
      focusNumber++;
      for (const [column, name] of focusColumns) {
        if (normalize(cells[column])) fields["Content Focus " + focusNumber + " / " + name] = cells[column];
      }
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
    issue(briefName, "Add a field for " + label.toLowerCase() + ".");
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

  match("Client", client.name.replace(/ \(Preview\)$/, ""), "Client name", "Brand");
  const channel = required("Channel");
  const normalizeChannel = (value) => normalize(value).replace(/^linkedin company page$/, "linkedin");
  if (channel && client.channel && normalizeChannel(channel.value) !== normalizeChannel(client.channel))
    issue(channel.location, "Channel must match " + client.channel + ".");
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

  const posts = required("Number of posts", "Post count", "Posts requested", "Planned post count");
  let postCount = null;
  if (posts) {
    const value = String(posts.value).trim();
    const count = Number(value);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
        Number.isInteger(count) && count >= 1 && count <= 40) postCount = count;
    else issue(posts.location, "Enter a whole number from 1 to 40.");
  }
  if (!modern && !sheets.has("key dates")) issue("Workbook", "Add the Key dates sheet, even if there are no dates to list.");
  return { validated: !issues.length, fields, issues, period: hasPeriod ? start.date + " to " + end.date : null, postCount };
}
