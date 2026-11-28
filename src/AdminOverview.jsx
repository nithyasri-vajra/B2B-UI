import { Chip, Page } from "./AdminControls";
import { statusText, statusTone } from "./labels";
import "./brand-settings.css";

const shortDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const showDate = (value) => value && Number.isFinite(Date.parse(value)) ? shortDate.format(new Date(value)) : "—";
const verdictTone = { READY: "g", LIMITED: "a", BLOCKED: "r" };

// Our Platform overview on the devs' data: tiles, access requests, runs that need a look, and the brands table.
export default function AdminOverview({ link, clients, data }) {
  const pending = data.users.filter((user) => user.status === "Pending role");
  const active = data.users.filter((user) => user.status === "Active");
  const readings = new Map(data.readiness.map((item) => [item.clientId, item]));
  const done = ["completed", "cancelled", "failed"];
  const inProgress = data.runs.filter((run) => !done.includes(String(run.status).toLowerCase()));
  const trouble = data.runs.filter((run) => ["failed", "blocked"].includes(String(run.status).toLowerCase()))
    .sort((a, b) => String(b.startedAt ?? b.createdAt ?? "").localeCompare(String(a.startedAt ?? a.createdAt ?? ""))).slice(0, 5);
  const reviews = data.records.filter((record) => record.review).length;
  const nameOf = (id) => id && (data.users.find((user) => String(user.id) === String(id))?.name ?? null);
  const brandName = (id) => clients.find((client) => client.id === String(id))?.name ?? "Brand";
  const recent = [...(data.audit ?? [])].sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? "")).slice(0, 5);
  const withData = clients.filter((client) => client.knowledgeVersion != null).length;
  return (
    <Page className="brand-settings-screen" title="Platform overview"
      description="Brands, people and anything that needs the Platform Admin."
      actions={<a className="btn pri" {...link("#new-client")}>New brand</a>}>
      {data.clientsLoadError && <p role="alert">{data.clientsLoadError}</p>}
      {data.usersLoadError && <p role="alert">{data.usersLoadError}</p>}
      <div className="our-g4">
        <div className="card"><p className="muted">Brands</p><p className="our-kpi">{clients.length}</p>
          <p className="muted">{withData} with published knowledge · {clients.length - withData} setting up</p></div>
        <div className="card"><p className="muted">Active people</p><p className="our-kpi">{active.length}</p>
          <p className="muted">{pending.length} waiting for access</p></div>
        <div className="card"><p className="muted">Runs in progress</p><p className="our-kpi">{inProgress.length}</p></div>
        <div className="card"><p className="muted">Runs failed or blocked</p><p className="our-kpi">{trouble.length}</p></div>
      </div>
      <div className="our-g2">
        <section className="card">
          <div className="our-between"><h2>Access requests</h2><a className="btn" {...link("#access-requests")}>Manage people</a></div>
          {!pending.length && <p className="muted">No one is waiting for access.</p>}
          {pending.map((user) => <div key={user.email} className="our-line">
            <p className="our-strong">{user.name ? user.name + " · " : ""}{user.email}</p>
            <p className="muted">{[showDate(user.requestedAt) !== "—" && "Asked " + showDate(user.requestedAt), user.note && "“" + user.note + "”"].filter(Boolean).join(" · ") || "Waiting for a role"}</p>
          </div>)}
        </section>
        <section className="card">
          <h2>Runs that need a look</h2>
          {!trouble.length && <p className="muted">No failed or blocked runs.</p>}
          {trouble.map((run) => <div key={run.id} className="our-between our-top our-line">
            <div><p className="our-strong">{brandName(run.clientId)} · {run.title ?? "Run " + String(run.id).slice(-6)}</p>
              {run.blocker?.reason && <p className="muted">{run.blocker.reason}</p>}</div>
            <Chip tone={statusTone(run.status) ?? "r"}>{statusText(run.status)}</Chip>
          </div>)}
          {reviews > 0 && <a {...link("RecordReview.dc.html")}>{reviews} knowledge records to review</a>}
        </section>
      </div>
      <section className="card our-flush">
        <div className="our-between our-pad"><h2>Brands</h2><a {...link("#clients")}>Manage brands</a></div>
        <div className="admin-table"><table>
          <thead><tr><th>Brand</th><th>Brand Manager</th><th>People</th><th>Knowledge</th><th>Readiness</th><th>Approver / backup</th><th>Last run</th></tr></thead>
          <tbody>
            {clients.map((client) => {
              const reading = readings.get(client.id);
              const lastRun = data.runs.filter((run) => run.clientId === client.id)
                .map((run) => run.startedAt ?? run.createdAt ?? "").sort().at(-1);
              return <tr key={client.id}>
                <td><p className="our-strong">{client.name}</p>{client.channel && <p className="muted">{client.channel}</p>}</td>
                <td>{data.users.filter((user) => user.assignments?.[client.id]?.includes("Brand Manager"))
                  .map((user) => user.name ?? user.email).join(", ") || <span className="muted">Unassigned</span>}</td>
                <td>{data.users.filter((user) => user.assignments?.[client.id]?.length).length}</td>
                <td>{client.knowledgeVersion != null ? "v" + client.knowledgeVersion : <span className="muted">Not published</span>}</td>
                <td>{reading?.verdict ? <Chip tone={verdictTone[reading.verdict]}>{reading.verdict}</Chip> : "—"}</td>
                <td>{(nameOf(client.defaultApproverUserId) ?? client.approver ?? "—") + " / " + (nameOf(client.backupApproverUserId) ?? client.backup ?? "—")}</td>
                <td>{showDate(lastRun)}</td>
              </tr>;
            })}
            {!clients.length && <tr><td colSpan={7} className="muted">No brands yet. Create one to begin.</td></tr>}
          </tbody>
        </table></div>
      </section>
      <section className="card">
        <div className="our-between"><h2>Recent activity</h2><a {...link("AuditLog.dc.html")}>Open audit log</a></div>
        {recent.length ? recent.map((item) => <div key={item.id} className="our-between"><span>{item.action} · {item.object ?? "—"}</span>
          <span className="muted">{showDate(item.timestamp)}</span></div>) : <p className="muted">No activity yet.</p>}
      </section>
    </Page>
  );
}
