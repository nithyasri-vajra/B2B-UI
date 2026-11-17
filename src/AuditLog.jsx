import { useState } from "react";
import { Button, Card, Field, Page, Select, Table } from "./AdminControls";

const headers = [
  "Time (IST)",
  "Client",
  "Actor",
  "Action",
  "Object",
  "Before",
  "After",
  "IP",
  "Device",
];
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function dateKey(date) {
  const parts = Object.fromEntries(
    dateFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}
function exportCSV(entries) {
  const csv = [headers, ...entries]
    .map((line) =>
      line
        .map((value) => {
          const text = String(value ?? "");
          const escaped =
            /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)
              ? "'" + text
              : text;
          return '"' + escaped.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "audit-log.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AuditLog({ data }) {
  const [filters, setFilters] = useState({
    client: "All",
    actor: "All",
    action: "All",
    date: "",
  });
  const set = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const events = data.audit.map((event) => {
    const timestamp = new Date(event.timestamp);
    return {
      ...event,
      date: Number.isNaN(timestamp.getTime()) ? "" : dateKey(timestamp),
      time: Number.isNaN(timestamp.getTime())
        ? ""
        : timeFormat.format(timestamp),
    };
  });
  const matching = events
    .filter(
      (event) =>
        (!filters.date || event.date === filters.date) &&
        (filters.client === "All" || event.clientId === filters.client) &&
        (filters.actor === "All" || event.actor === filters.actor) &&
        (filters.action === "All" || event.action === filters.action),
    )
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .map((event) => [
      event.date ? event.date + " " + event.time : "—",
      data.clients.find((client) => client.id === event.clientId)?.name ?? "—",
      event.actor ?? "—",
      event.action,
      event.object ?? "—",
      event.before ?? "—",
      event.after ?? "—",
      event.ip ?? "—",
      event.device ?? "—",
    ]);
  return (
    <Page
      title="Audit log"
      description="Platform Admin · activity across all clients"
      actions={
        <Button
          primary
          disabled={!matching.length}
          onClick={() => exportCSV(matching)}
        >
          Export CSV
        </Button>
      }
    >
      <Card>
        <div className="admin-actions">
          <Field label="Client">
            <select
              aria-label="Client filter"
              value={filters.client}
              onChange={(event) => set("client", event.target.value)}
            >
              <option>All</option>
              {data.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Select
            label="Actor"
            options={[
              "All",
              ...new Set(events.map((event) => event.actor).filter(Boolean)),
            ]}
            value={filters.actor}
            onChange={(value) => set("actor", value)}
          />
          <Select
            label="Action type"
            options={[
              "All",
              ...new Set(events.map((event) => event.action).filter(Boolean)),
            ]}
            value={filters.action}
            onChange={(value) => set("action", value)}
          />
          <Field label="Date (IST)">
            <input
              type="date"
              value={filters.date}
              onChange={(event) => set("date", event.target.value)}
            />
          </Field>
        </div>
        <Table
          headers={headers}
          rows={matching}
          empty="No audit events match these filters."
        />
      </Card>
    </Page>
  );
}
