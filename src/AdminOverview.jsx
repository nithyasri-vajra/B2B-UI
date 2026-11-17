import { Card, Chip, Page, Table } from "./AdminControls";

export default function AdminOverview({ link, clients, data }) {
  const pending = data.users.filter(
    (user) => user.status === "Pending role",
  ).length;
  const reviews = data.records.filter((record) => record.review).length;
  const readings = new Map(data.readiness.map((item) => [item.clientId, item]));
  const recent = [...data.audit]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 5);

  return (
    <Page
      title="Admin overview"
      description="Platform Admin · all clients"
      actions={
        <a className="btn pri" {...link("#new-client")}>
          Create client
        </a>
      }
    >
      <div className="admin-grid">
        <Card title="Clients by readiness">
          <div className="admin-actions">
            {[
              ["Green", "g"],
              ["Amber", "a"],
              ["Red", "r"],
            ].map(([band, tone]) => (
              <Chip key={band} tone={tone}>
                {band}{" "}
                {
                  clients.filter(
                    (client) => readings.get(client.id)?.band === band,
                  ).length
                }
              </Chip>
            ))}
          </div>
        </Card>
        <Card title="Access requests">
          <strong>{pending}</strong>
          <a {...link("#access-requests")}>Assign roles</a>
        </Card>
        <Card title="Knowledge reviews due">
          <strong>{reviews}</strong>
          <a {...link("RecordReview.dc.html")}>Open records</a>
        </Card>
        <Card title="Agent health">
          <p>
            {data.runs.length
              ? "Runs: " +
                data.runs.filter((run) => run.status === "Completed").length +
                " completed · " +
                data.runs.filter((run) => run.status === "Failed").length +
                " failed"
              : "No runs yet."}
          </p>
        </Card>
      </div>
      <Card title="Clients">
        <Table
          headers={[
            "Client",
            "Channels",
            "Readiness",
            "Knowledge",
            "Approver / backup",
            "Last run",
          ]}
          rows={clients.map((client) => [
            <strong>{client.name}</strong>,
            client.channel ?? "—",
            readings.get(client.id)?.band ?? "—",
            client.knowledge ?? "—",
            (client.approver ?? "—") + " / " + (client.backup ?? "—"),
            [...data.runs]
              .filter((run) => run.clientId === client.id)
              .map((run) => run.startedAt ?? "")
              .sort()
              .at(-1) || "—",
          ])}
          empty="No clients yet. Create a client to begin."
        />
        <a {...link("#clients")}>Open clients</a>
      </Card>
      <div className="admin-grid">
        <Card title="Needs attention">
          {data.notifications.length ? (
            data.notifications.map((item) => (
              <p key={item.id}>{item.message}</p>
            ))
          ) : (
            <p className="muted">Nothing needs attention.</p>
          )}
        </Card>
        <Card title="Recent activity">
          {recent.length ? (
            recent.map((item) => (
              <p key={item.id}>
                {item.action} · {item.object ?? "—"}
              </p>
            ))
          ) : (
            <p className="muted">No activity yet.</p>
          )}
          <a {...link("AuditLog.dc.html")}>Open audit log</a>
        </Card>
      </div>
    </Page>
  );
}
