import { useId, useState } from "react";
import { Button, Card, Chip, Page, Table, Tabs, useAction } from "./AdminControls";
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
  ["knowledge", "Knowledge"],
];
const titles = {
  home: "W03 · Home",
  "new-run": "W04 · New run — attach brief",
  runs: "W05 · Run workspace",
  plan: "W06 · Gate 1 — content plan review",
  post: "W07 · Gate 2 — post review",
  approvals: "W08 · Approvals queue",
  calendar: "Content calendar",
  knowledge: "Knowledge readiness",
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
              (readiness?.preview && !canStartRun(readiness)
                ? readiness.canPublish ? "Publish knowledge to start a run." : "Approve the five knowledge files to continue."
                : !readiness ? "Knowledge readiness has not been assessed." : "")}
          </p>
        </Card>
        <Card title="Knowledge readiness">
          <div>
            <Chip>
              {readiness?.blocked
                ? "Blocked"
                : (readiness?.band ?? (readiness?.canStart ? "Ready" : "Not assessed"))}
            </Chip>
          </div>
          {readiness?.score != null && <p>{readiness.score} / 100</p>}
          <a href={href("knowledge")}>Open readiness</a>
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
                <div>
                  <Chip>{run.status}</Chip>
                  {run.currentStep && <p className="muted">{run.currentStep}</p>}
                  {run.progressLabel && <p className="muted">{run.progressLabel}</p>}
                </div>
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

const calendarZone = "Asia/Kolkata";
const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: calendarZone, dateStyle: "short" });
const calendarTime = new Intl.DateTimeFormat("en-IN", { timeZone: calendarZone, timeStyle: "short" });
const calendarMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function offsetDay(day, offset) {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

export function ContentCalendar({ data, client, href, action }) {
  const [mode, setMode] = useState("Month");
  const [cursor, setCursor] = useState(() => new Date(dateKey.format(new Date())));
  const { submit, busy, feedback } = useAction(action);
  const month = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const anchor = mode === "Month" ? month : cursor;
  const start = offsetDay(anchor, -((anchor.getUTCDay() + 6) % 7));
  const days = Array.from({ length: mode === "Month" ? 42 : 7 }, (_, i) => offsetDay(start, i));
  const posts = data.posts.filter((post) => post.clientId === client?.id && Number.isFinite(Date.parse(post.scheduledAt)));
  const tones = { Scheduled: "b", Verified: "g", Published: "g", "Published (unverified)": "g", "On hold": "a", Failed: "r", Cancelled: "r" };

  function move(direction) {
    setCursor(mode === "Month"
      ? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + direction, 1))
      : offsetDay(cursor, direction * 7));
  }

  function changeSchedule(post, name, label) {
    const reason = window.prompt(label + " this scheduled post? Enter a reason to confirm.");
    if (reason?.trim()) submit(name, { postId: post.id, runId: post.runId, reason: reason.trim() });
  }

  return (
    <Page title="Content calendar" description="LinkedIn · IST">
      <Card>
        <div className="admin-row">
          <Tabs values={["Month", "Week"]} value={mode} onChange={setMode} />
          <div className="admin-actions">
            <Button onClick={() => move(-1)}>Previous</Button>
            <strong>{calendarMonth.format(anchor)}</strong>
            <Button onClick={() => move(1)}>Next</Button>
          </div>
        </div>
        {feedback}
        <div className="workflow-calendar-scroll">
          <div className="workflow-calendar">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong key={day}>{day}</strong>)}
            {days.map((day) => {
              const key = day.toISOString().slice(0, 10);
              return (
                <section className="workflow-calendar-day" key={key} aria-label={key}>
                  <time className="muted" dateTime={key}>{day.getUTCDate()}</time>
                  {posts.filter((post) => dateKey.format(new Date(post.scheduledAt)) === key).map((post) => (
                    <article className="workflow-calendar-post" key={post.id}>
                      <a href={href("post", { run: post.runId, post: post.id })}>{post.title ?? "Open post"}</a>
                      <span>{calendarTime.format(new Date(post.scheduledAt))}</span>
                      <div><Chip tone={tones[post.status]}>{post.status}</Chip></div>
                      {post.status === "Scheduled" && (
                        <div className="admin-actions">
                          <Button disabled={busy} onClick={() => changeSchedule(post, "holdPost", "Hold")}>Hold</Button>
                          <Button disabled={busy} onClick={() => changeSchedule(post, "cancelScheduledPost", "Cancel")}>Cancel</Button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
        {!posts.length && <p className="muted">No posts scheduled.</p>}
      </Card>
    </Page>
  );
}
