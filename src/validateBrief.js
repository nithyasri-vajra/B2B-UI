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
  const { sheets, rows, date1904 } = workbook;
  if (!sheets.has("brief")) {
    issue("Workbook", "Add a Brief sheet with Field and Value columns.");
    return invalid;
  }

  const values = new Map();
  for (const { number, label, value } of rows) {
    const name = String(label ?? "").trim();
    const key = name.toLowerCase();
    if (!key || key === "field") continue;
    if (values.has(key)) {
      issue("Brief!A" + number, "Duplicate field: " + name + ".");
      continue;
    }
    values.set(key, { name, value, location: "Brief!B" + number });
    if (value != null) fields[name] = value;
  }

  function required(label, ...aliases) {
    for (const name of [label, ...aliases]) {
      const entry = values.get(name.toLowerCase());
      if (!entry) continue;
      if (entry.value != null && String(entry.value).trim()) return entry;
      issue(entry.location, "Enter " + label.toLowerCase() + ".");
      return null;
    }
    issue("Brief", "Add a field for " + label.toLowerCase() + ".");
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
    if (!date) issue(entry.location, "Use an Excel date or YYYY-MM-DD.");
    else fields[entry.name] = date;
    return { date, location: entry.location };
  }

  match("Client", client.name.replace(/ \(Preview\)$/, ""), "Client name");
  match("Channel", client.channel);
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

  const posts = required("Number of posts", "Post count", "Posts requested");
  let postCount = null;
  if (posts) {
    const value = String(posts.value).trim();
    const count = Number(value);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) &&
        Number.isInteger(count) && count >= 1 && count <= 40) postCount = count;
    else issue(posts.location, "Enter a whole number from 1 to 40.");
  }
  if (!sheets.has("key dates")) issue("Workbook", "Add the Key dates sheet, even if there are no dates to list.");
  return { validated: !issues.length, fields, issues, period: hasPeriod ? start.date + " to " + end.date : null, postCount };
}
