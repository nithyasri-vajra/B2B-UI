import { useId, useState } from "react";
import { Card, Chip, Page, Table } from "./AdminControls";
import "./workflow.css";

export const pipeline = [
  "Brief qualifier",
  "Content planner",
  "Gate 1",
  "Post writer",
  "QA reviewer",
  "Gate 2",
  "Scheduled publish",
  "Publication check",
];

export function canStartRun(report) {
  if (
    !report ||
    report.blocked ||
    report.canStart === false ||
    report.gates?.some((gate) => gate.passed === false)
  )
    return false;
  return (
    report.canStart === true ||
    (["Green", "Amber"].includes(report.band) &&
      Boolean(report.gates?.length) &&
      report.gates.every((gate) => gate.passed === true))
  );
}

const nav = [
  ["home", "Home"],
  ["new-run", "Agents"],
  ["runs", "Runs"],
  ["approvals", "Approvals"],
  ["calendar", "Content calendar"],
  ["readiness", "Knowledge"],
];
const titles = {
  home: "W03 · Home",
  "new-run": "W04 · New run — attach brief",
  runs: "W05 · Run workspace",
  plan: "W06 · Gate 1 — content plan review",
  post: "W07 · Gate 2 — post review",
  approvals: "W08 · Approvals queue",
  calendar: "Content calendar",
};

export function WorkflowShell({
  page,
  data,
  clients,
  client,
  onClientChange,
  href,
  children,
}) {
  const clientId = useId();
  const [showNotifications, setShowNotifications] = useState(false);
  const approvals = data.approvals.filter(
    (item) => item.clientId === client?.id && item.status === "Pending",
  ).length;
  const notifications = data.notifications.filter(
    (item) => !item.clientId || item.clientId === client?.id,
  );
  const current = ["plan", "post"].includes(page) ? "approvals" : page;
  return (
    <div className="b2b-admin workflow">
      <div className="app">
        <nav className="side" aria-label="Main">
          <div className="workflow-brand">
            <span className="ph">V</span>
            <strong>B2B Agents</strong>
          </div>
          {nav.map(([key, label]) => (
            <a
              key={key}
              href={href(key)}
              className={"nav" + (key === current ? " on" : "")}
              aria-current={key === current ? "page" : undefined}
            >
              {label}
              {key === "approvals" && approvals > 0 && (
                <Chip tone="b">{approvals}</Chip>
              )}
            </a>
          ))}
          {data.session?.role === "Platform Admin" && (
            <a className="nav" href={href("overview")}>
              Admin
            </a>
          )}
        </nav>
        <div className="main">
          <header className="top">
            <span className="wf">{titles[page]}</span>
            <div style={{ flexGrow: 1 }} />
            <label className="muted" htmlFor={clientId}>
              Client
            </label>
            <select
              id={clientId}
              value={client?.id ?? ""}
              disabled={!clients.length}
              onChange={(event) => onClientChange(event.target.value)}
            >
              {!clients.length && <option value="">No clients</option>}
              {clients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              aria-expanded={showNotifications}
              onClick={() => setShowNotifications((value) => !value)}
            >
              Notifications ·{" "}
              {notifications.filter((item) => !item.read).length}
            </button>
            <div className="workflow-user">
              <span className="ph">{data.session?.name?.[0] ?? "—"}</span>
              <div>
                <strong>
                  {data.session?.name ?? <a href={href("sign-in")}>Sign in</a>}
                </strong>
                <p className="muted">{data.session?.role ?? "—"}</p>
              </div>
            </div>
          </header>
          {showNotifications && (
            <section className="card" aria-label="Notifications">
              {notifications.length ? (
                notifications.map((item) => <p key={item.id}>{item.message}</p>)
              ) : (
                <p>No notifications.</p>
              )}
            </section>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function WorkflowLink({ href, children, primary, gate }) {
  return (
    <a className={"btn" + (gate ? " gate" : primary ? " pri" : "")} href={href}>
      {children}
    </a>
  );
}

export function OperatorHome({ data, client, href }) {
  const scope = (items) =>
    client ? items.filter((item) => item.clientId === client.id) : [];
  const readiness = scope(data.readiness)[0];
  const active = scope(data.runs).filter(
    (item) => !["Completed", "Cancelled", "Failed"].includes(item.status),
  );
  const tasks = scope(data.tasks)
    .filter((item) => !item.done)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const now = Date.now();
  const upcoming = scope(data.posts)
    .filter((item) => {
      const time = Date.parse(item.scheduledAt);
      return (
        item.status === "Scheduled" && time >= now && time < now + 7 * 86400000
      );
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return (
    <Page
      title={data.session?.name ? "Good morning, " + data.session.name : "Home"}
      description={
        client
          ? client.name + " · LinkedIn · IST"
          : "Select a client to view your workspace."
      }
    >
      <div className="workflow-home-grid">
        <Card title="Social Media Agent — LinkedIn">
          <p className="muted">{pipeline.slice(0, -1).join(" → ")}</p>
          <div className="admin-actions">
            {client && canStartRun(readiness) ? (
              <WorkflowLink href={href("new-run")} primary>
                Start new run
              </WorkflowLink>
            ) : (
              <button className="btn pri" type="button" disabled>
                Start new run
              </button>
            )}
            {data.integrations.briefTemplateUrl && (
              <a href={data.integrations.briefTemplateUrl} download>
                Download brief template (.xlsx)
              </a>
            )}
          </div>
          <p className="muted">
            {readiness?.reason ??
              (!readiness ? "Knowledge readiness has not been assessed." : "")}
          </p>
        </Card>
        <Card title="Knowledge readiness">
          <div>
            <Chip>
              {readiness?.blocked
                ? "Blocked"
                : (readiness?.band ?? "Not assessed")}
            </Chip>
          </div>
          {readiness?.score != null && <p>{readiness.score} / 100</p>}
          <a href={href("readiness")}>Open readiness</a>
        </Card>
      </div>
      <div className="admin-grid">
        <Card title="My tasks">
          {tasks.length ? (
            tasks.map((task) => (
              <div key={task.id} className="admin-row">
                <div>
                  <strong>{task.title}</strong>
                  <p className="muted">{task.dueAt ?? ""}</p>
                </div>
                {task.runId && (
                  <a
                    href={href(task.page ?? "runs", {
                      run: task.runId,
                      post: task.postId,
                    })}
                  >
                    Open
                  </a>
                )}
              </div>
            ))
          ) : (
            <p className="muted">No tasks waiting for you.</p>
          )}
        </Card>
        <Card title="Active runs">
          {active.length ? (
            active.map((run) => (
              <div key={run.id} className="admin-row">
                <strong>{run.name ?? run.period ?? run.id}</strong>
                <Chip>{run.status}</Chip>
                <a href={href("runs", { run: run.id })}>Open run</a>
              </div>
            ))
          ) : (
            <p className="muted">No active runs.</p>
          )}
        </Card>
      </div>
      <Card title="Coming up — next 7 days">
        <Table
          headers={["Post", "Scheduled", "Status"]}
          rows={upcoming.map((post) => [
            post.title,
            post.scheduledAt,
            <Chip>{post.status}</Chip>,
          ])}
          empty="No posts scheduled in the next 7 days."
        />
      </Card>
    </Page>
  );
}

export function ContentCalendar({ data, client, href }) {
  const posts = client
    ? data.posts
        .filter((post) => post.clientId === client.id && post.scheduledAt)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    : [];
  return (
    <Page title="Content calendar">
      <Card>
        <Table
          headers={["Scheduled", "Post", "Status"]}
          rows={posts.map((post) => [
            post.scheduledAt,
            <a href={href("post", { run: post.runId, post: post.id })}>
              {post.title}
            </a>,
            <Chip>{post.status}</Chip>,
          ])}
          empty="No posts scheduled."
        />
      </Card>
    </Page>
  );
}
