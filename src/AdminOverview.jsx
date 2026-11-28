import { Card, Page, Table } from "./AdminControls";
import "./brand-settings.css";

export default function AdminOverview({ link, clients, data }) {
  const pending = data.users.filter(
    (user) => user.status === "Pending role",
  ).length;
  const reviews = data.records.filter((record) => record.review).length;
  const readings = new Map(data.readiness.map((item) => [item.clientId, item]));
  const recent = [...data.audit]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 5);

  const month = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata",
  });
  const currentMonth = month.format(new Date());
  const thisMonth = (value) => Number.isFinite(Date.parse(value)) && month.format(new Date(value)) === currentMonth;
  const runs = data.runs.filter((run) => thisMonth(run.startedAt));
  const live = data.posts.filter((post) =>
    ["Live", "Verified", "Published", "Published (unverified)"].includes(post.status) && thisMonth(post.publishedAt),
  );
  return (
    <Page
      className="brand-settings-screen"
      title="Platform overview"
      description="Platform Admin · all clients"
      actions={
        <a className="btn pri" {...link("#new-client")}>
          + Create brand space
        </a>
      }
    >
      {data.clientsLoadError && <p role="alert">{data.clientsLoadError}</p>}
      {data.usersLoadError && <p role="alert">{data.usersLoadError}</p>}
      <div className="platform-overview-stats">
        <Card title="Brands"><strong>{clients.length}</strong><a {...link("#clients")}>Manage brand spaces</a></Card>
        <Card title="People"><strong>{data.users.length}</strong><a {...link("#access-requests")}>{pending} waiting for access</a></Card>
        <Card title="Runs this month"><strong>{runs.length}</strong><span>{runs.filter((run) => run.status === "Failed").length} failed</span></Card>
        <Card title="Posts live this month"><strong>{live.length}</strong></Card>
      </div>
      <div className="brand-spaces-layout">
      <Card title="Brands">
        <Table
          headers={[
            "Brand",
            "Channel",
            "Brand Manager",
            "People",
            "Readiness",
            "Knowledge",
            "Approver / backup",
            "Last run",
            "Status",
          ]}
          rows={clients.map((client) => [
            <strong>{client.name}</strong>,
            client.channel ?? "—",
            data.users.filter((user) => user.assignments?.[client.id]?.includes("Brand Manager"))
              .map((user) => user.name ?? user.email).join(", ") || "Unassigned",
            data.users.filter((user) => user.assignments?.[client.id]?.length).length,
            readings.get(client.id)?.score ?? readings.get(client.id)?.band ?? "-",
            client.knowledge ?? client.knowledgeVersion ?? "-",
            (client.approver ?? "—") + " / " + (client.backup ?? "—"),
            [...data.runs]
              .filter((run) => run.clientId === client.id)
              .map((run) => run.startedAt ?? "")
              .sort()
              .at(-1) || "—",
            client.status ?? "Active",
          ])}
          empty="No clients yet. Create a client to begin."
        />
        <a {...link("#clients")}>Manage brand spaces</a>
      </Card>
        <Card title="Needs attention">
          {data.notifications.length ? (
            data.notifications.map((item) => (
              <p key={item.id}>{item.message}</p>
            ))
          ) : (
            <p className="muted">Nothing needs attention.</p>
          )}
          {reviews > 0 && <a {...link("RecordReview.dc.html")}>{reviews} knowledge records to review</a>}
        </Card>
      </div>
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
    </Page>
  );
}
