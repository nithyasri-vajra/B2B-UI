import { useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  Page,
  Select,
  Table,
  Tabs,
  useAction,
} from "./AdminControls";

const states = [
  "Captured",
  "Verified",
  "Approved",
  "Disputed",
  "Superseded",
  "Expired",
];
const views = ["Records", "Change proposals"];
const decisions = ["Keep A", "Keep B", "Keep both with scope", "Escalate"];

export function Records({ action, data, client }) {
  const [view, setView] = useState(views[0]);
  const records = client
    ? data.records.filter((item) => item.clientId === client.id)
    : [];
  const proposals = client
    ? data.proposals.filter((item) => item.clientId === client.id)
    : [];
  const [filters, setFilters] = useState({});
  const [id, setId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [scope, setScope] = useState("");
  const record = records.find((item) => item.id === id);
  const rival = records.find(
    (item) =>
      item.id !== id && item.item === record?.item && item.state === "Disputed",
  );
  const { submit, busy, feedback } = useAction(action);
  const fields = [
    ["domain", "Domain", [...new Set(records.map((r) => r.domain))]],
    ["item", "Item", [...new Set(records.map((r) => r.item))]],
    ["state", "State", states],
    ["grade", "Evidence grade", ["A", "B", "C", "D"]],
    ["reuse", "Reuse permission", ["Public", "Restricted", "Internal only"]],
  ];
  const matching = records.filter(
    (item) =>
      fields.every(
        ([key]) =>
          !filters[key] || filters[key] === "All" || item[key] === filters[key],
      ) &&
      (!filters.review || item.review),
  );

  function update(name, values) {
    return submit(name, { id, ...values });
  }

  return (
    <Page
      title="Knowledge records"
      description={
        client?.name ?? "Select a client to review knowledge records."
      }
    >
      <Tabs values={views} value={view} onChange={setView} />
      {view === "Records" ? (
        <Card>
          <div className="admin-actions">
            {fields.map(([key, label, options]) => (
              <Select
                key={key}
                label={label}
                options={["All", ...options]}
                value={filters[key] ?? "All"}
                onChange={(value) => setFilters({ ...filters, [key]: value })}
              />
            ))}
            <label>
              <input
                type="checkbox"
                checked={Boolean(filters.review)}
                onChange={(event) =>
                  setFilters({ ...filters, review: event.target.checked })
                }
              />{" "}
              Needs review
            </label>
          </div>
          <Table
            headers={[
              "Record",
              "Domain",
              "Item",
              "State",
              "Grade",
              "Reuse permission",
              "",
            ]}
            rows={matching.map((item) => [
              item.id,
              item.domain,
              item.item,
              <Chip
                tone={
                  item.state === "Approved"
                    ? "g"
                    : item.state === "Disputed"
                      ? "a"
                      : undefined
                }
              >
                {item.state}
              </Chip>,
              item.grade,
              item.reuse,
              <Button
                onClick={() => {
                  setId(item.id);
                  setDraft(null);
                  setConflict(false);
                  setScope("");
                }}
              >
                Open record
              </Button>,
            ])}
            empty="No records match these filters."
          />
        </Card>
      ) : (
        <Card title="Proposed knowledge changes">
          <Table
            headers={[
              "Source",
              "Before",
              "After",
              "Evidence",
              "Materiality",
              "Affected posts",
              "Status",
              "Actions",
            ]}
            rows={proposals.map((proposal) => [
              proposal.source ?? "—",
              proposal.before ?? "—",
              proposal.after ?? "—",
              proposal.evidence ?? "—",
              proposal.materiality ?? "—",
              proposal.affectedPosts?.join(", ") || "—",
              <Chip>{proposal.status ?? "Pending review"}</Chip>,
              <div className="admin-actions">
                {[
                  ["Approve", "Approved"],
                  ["Reject", "Rejected"],
                  [
                    "Request client confirmation",
                    "Awaiting client confirmation",
                  ],
                ].map(([label, status]) => (
                  <Button
                    key={status}
                    disabled={
                      busy ||
                      ["Approved", "Rejected"].includes(proposal.status) ||
                      status === proposal.status
                    }
                    onClick={() =>
                      submit("reviewKnowledgeChange", {
                        id: proposal.id,
                        status,
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>,
            ])}
            empty="No change proposals yet."
          />
        </Card>
      )}
      {record && view === "Records" && (
        <aside className="card admin-drawer" aria-label="Record detail">
          <div className="admin-row">
            <h2>
              {record.id}
              {record.version && " · " + record.version}
            </h2>
            <Button onClick={() => setId(null)}>Close</Button>
          </div>
          <p>
            {record.type} · {record.item} · <Chip>{record.state}</Chip>
          </p>
          {draft ? (
            <form
              className="admin-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (await update("editKnowledgeRecord", draft)) setDraft(null);
              }}
            >
              <Field label="Statement">
                <textarea
                  required
                  value={draft.statement}
                  onChange={(event) =>
                    setDraft({ ...draft, statement: event.target.value })
                  }
                />
              </Field>
              <Field label="Permitted public wording">
                <textarea
                  value={draft.wording}
                  onChange={(event) =>
                    setDraft({ ...draft, wording: event.target.value })
                  }
                />
              </Field>
              <div className="admin-actions">
                <Button primary type="submit" disabled={busy}>
                  Save changes
                </Button>
                <Button onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="admin-grid">
                <div>
                  <h2>Statement</h2>
                  <p>{record.statement}</p>
                </div>
                <div>
                  <h2>Evidence</h2>
                  <p>{record.source}</p>
                  <blockquote>{record.quote}</blockquote>
                </div>
              </div>
              <div>
                <h2>Permitted public wording</h2>
                <p>{record.wording}</p>
              </div>
              <Table
                headers={["Grade", "Scope", "Reuse permission", "Owner"]}
                rows={[
                  [
                    record.grade,
                    record.scope ?? "—",
                    record.reuse,
                    record.owner ?? "—",
                  ],
                ]}
              />
              <Table
                headers={["Collected", "Approved", "Review by", "Valid until"]}
                rows={[
                  [
                    record.collectedAt ?? "—",
                    record.approved ?? "—",
                    record.reviewBy ?? "—",
                    record.validUntil ?? "—",
                  ],
                ]}
              />
              <div>
                <h2>History</h2>
                <p className="muted">
                  {record.history?.join(" · ") || "No history yet."}
                </p>
              </div>
              <div className="admin-actions">
                <Button
                  primary
                  disabled={
                    busy ||
                    ["Approved", "Disputed", "Superseded", "Expired"].includes(
                      record.state,
                    )
                  }
                  onClick={() =>
                    update("approveKnowledgeRecord", {
                      state: "Approved",
                      review: false,
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  onClick={() =>
                    setDraft({
                      statement: record.statement,
                      wording: record.wording,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  disabled={busy || record.state === "Rejected"}
                  onClick={() =>
                    update("rejectKnowledgeRecord", {
                      state: "Rejected",
                      review: false,
                    })
                  }
                >
                  Reject
                </Button>
                <Button
                  disabled={busy || record.state === "Disputed"}
                  onClick={() =>
                    update("disputeKnowledgeRecord", {
                      state: "Disputed",
                      review: true,
                    })
                  }
                >
                  Mark disputed
                </Button>
                <Button
                  disabled={busy || record.state === "Superseded"}
                  onClick={() =>
                    update("supersedeKnowledgeRecord", {
                      state: "Superseded",
                      review: false,
                    })
                  }
                >
                  Supersede
                </Button>
                {rival && record.state === "Disputed" && (
                  <Button onClick={() => setConflict(true)}>
                    View conflict
                  </Button>
                )}
              </div>
            </>
          )}
          {conflict && rival && (
            <Card title="Conflicting records">
              <div className="admin-grid">
                {[record, rival].map((item, i) => (
                  <div key={item.id}>
                    <strong>
                      {i === 0 ? "A" : "B"} · {item.id}
                    </strong>
                    <p>{item.statement}</p>
                    <p className="muted">{item.source}</p>
                  </div>
                ))}
              </div>
              <Field label="Scope for keeping both">
                <input
                  type="text"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </Field>
              <div className="admin-actions">
                {decisions.map((decision) => (
                  <Button
                    key={decision}
                    disabled={
                      busy ||
                      (decision === "Keep both with scope" && !scope.trim())
                    }
                    onClick={() =>
                      submit(
                        "resolveKnowledgeConflict",
                        { records: [id, rival.id], decision, scope },
                        () => setConflict(false),
                      )
                    }
                  >
                    {decision}
                  </Button>
                ))}
              </div>
            </Card>
          )}
          {feedback}
        </aside>
      )}
      {(!record || view !== "Records") && feedback}
    </Page>
  );
}
