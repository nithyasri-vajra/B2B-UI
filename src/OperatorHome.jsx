import { useId, useState } from "react";
import { Button, Card, Chip, Page, Tabs, useAction } from "./AdminControls";
import { AppShell } from "./AppShell";
import { stageLabels, statusText, statusTone } from "./labels";
import "./workflow.css";
import "./brand-home.css";
import "./content-calendar.css";

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

export function configuredAgent(data, agentId) {
  return agentId ? data.agents?.find((agent) => agent.id === agentId) : undefined;
}

export function canStartRun(report) {
  if (
    !report ||
    report.verdict === "BLOCKED" ||
    report.blocked ||
    report.canStart === false ||
    report.gates?.some((gate) => gate.passed === false)
  )
    return false;
  return (
    ["READY", "LIMITED"].includes(report.verdict) ||
    report.canStart === true ||
    (["Green", "Amber"].includes(report.band) &&
      Boolean(report.gates?.length) &&
      report.gates.every((gate) => gate.passed === true))
  );
}

// The brand workspace uses the shared sidebar and top bar (AppShell).
export function WorkflowShell({
  page, data, clients, client, onClientChange, href, brandsHref, approvalsHref, profileHref,
  platformHref, onSignOut, children,
}) {
  const approvals = (data.reviewDecisions ?? []).filter((item) => item.status === "pending").length ||
    data.approvals.filter((item) => item.clientId === client?.id && item.status === "Pending").length;
  return (
    <AppShell page={page} session={data.session} clients={clients} client={client} onClientChange={onClientChange}
      href={href} platformHref={platformHref ?? href} brandsHref={brandsHref}
      approvalsHref={approvalsHref ?? href("approvals")} approvalsCount={approvals}
      profileHref={profileHref ?? href("profile")} onSignOut={onSignOut}
      className={page === "home" ? "brand-home-shell" : ""}>
      {children}
    </AppShell>
  );
}

export function WorkflowLink({ href, children, primary, gate }) {
  if (!href) return null;
  return (
    <a className={"btn" + (gate ? " gate" : primary ? " pri" : "")} href={href}>
      {children}
    </a>
  );
}

function BrandSetupHome({ client, data, agent, readiness, team, href }) {
  const knowledge = href("knowledge") ?? href("readiness");
  const settings = href("client-settings");
  const destinations = (data.integrations.linkedin?.profiles ?? []).some(
    (profile) => profile.clientId === client.id && profile.connected && profile.eligible !== false,
  );
  const knowledgeStarted = Boolean(readiness || data.uploads.some((upload) => upload.clientId === client.id));
  const readyToPublish = readiness?.canPublish === true && !readiness.blocked &&
    !readiness.gates?.some((gate) => gate.passed === false);
  const steps = [
    ["Brand profile and channels", "Name, website, time zone and publishing channel", Boolean(client.name && client.website && client.timezone && client.channel), settings, "Set up"],
    ["Agents for this brand", agent?.name ?? "Choose an agent for this brand", Boolean(agent && agent.enabled !== false), href("agents"), "Set up"],
    ["Members and roles", team.length ? `${team.length} assigned team members` : "Assign people to this brand", team.length > 0, href("users"), "Manage"],
    ["Named approver and backup", "Needed before the first run", Boolean(client.approver && client.backup && client.approver !== client.backup), settings, "Choose"],
    ["Where each agent publishes", "Connect an eligible publishing destination", destinations, settings, "Set up"],
    ["Knowledge layer", readiness?.reason ?? "Upload and review the brand's knowledge", readyToPublish, href("setup") ?? knowledge, "Continue", knowledgeStarted],
    ["Publish knowledge version 1", "Available once readiness and required checks pass", false, readyToPublish ? knowledge : undefined, "Review and publish", false, !readyToPublish],
  ];
  const complete = steps.filter((step) => step[2]).length;

  return (
    <main className="brand-home">
      <div className="brand-home-heading">
        <span className="brand-home-mark" aria-hidden="true">{client.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>
        <div><h1>{client.name}</h1><Chip tone="a">Setting up</Chip></div>
        {href("new-run") && <div className="brand-home-actions"><Button primary disabled>New run</Button></div>}
      </div>
      <div className="brand-home-columns">
        <Card title={`Get ${client.name} ready for its first run`}>
          <p>{complete} of {steps.length} steps complete.</p>
          <progress aria-label="Brand setup progress" value={complete} max={steps.length} />
          <ol className="brand-setup-steps">
            {steps.map(([title, description, done, link, action, inProgress, locked], index) => (
              <li key={title}>
                <span className="brand-setup-step-number" data-done={done} aria-hidden="true">{done ? "✓" : index + 1}</span>
                <div><strong>{title}</strong><p>{description}</p></div>
                <Chip tone={done ? "g" : inProgress ? "b" : locked ? undefined : "a"}>{done ? "Done" : locked ? "Locked" : inProgress ? "In progress" : "To do"}</Chip>
                {!done && <WorkflowLink href={link} primary={action === "Choose"}>{action}</WorkflowLink>}
              </li>
            ))}
          </ol>
        </Card>
        <div className="brand-home-stack">
          <Card title="Knowledge">
            <div className="brand-home-score">
              <Chip>{readiness?.verdict ?? readiness?.band ?? (readyToPublish ? "Ready to publish" : "Not ready")}</Chip>
            </div>
            {readiness?.reason && <p>{readiness.reason}</p>}
            {knowledge && <a href={knowledge}>See what’s missing</a>}
          </Card>
          <Card title="Team">
            {href("users") && <a href={href("users")}>Manage</a>}
            {team.length ? team.map((user) => (
              <div className="brand-home-member" key={user.email}>
                <span className="brand-home-mark" aria-hidden="true">{(user.name || user.email)?.[0]?.toUpperCase()}</span>
                <div><strong>{user.name || user.email}</strong><p>{user.assignments?.[client.id]?.join(", ")}</p></div>
              </div>
            )) : <p>No team details are available in this workspace.</p>}
          </Card>
        </div>
      </div>
    </main>
  );
}

export function needsFirstRunSetup(client, readiness) {
  return Boolean(client && !client.knowledgeVersion && !client.knowledge && !canStartRun(readiness));
}

export function OperatorHome({ data, client, href, showSetup = false }) {
  const scope = (items) => client ? items.filter((item) => item.clientId === client.id) : [];
  const readiness = scope(data.readiness)[0];
  const agentNames = new Map(scope(data.projects ?? []).flatMap(({ agents = [] }) =>
    agents.map(({ agentKey, name }) => [agentKey, name])));
  const agentReadiness = Object.entries(readiness?.perAgent ?? {});
  const agent = configuredAgent(data, client?.agentId);
  const canRun = client && canStartRun(readiness);
  const newRun = href("new-run");
  const runs = scope(data.runs).filter(({ status }) => !["Completed", "Cancelled", "Failed"].includes(status));
  const tasks = scope(data.tasks).filter(({ done }) => !done)
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  const today = dateKey.format(new Date());
  const posts = scope(data.posts).filter(({ scheduledAt }) => Number.isFinite(Date.parse(scheduledAt)));
  const team = client ? data.users.filter((user) => user.assignments?.[client.id]?.length || user.clientAssignments?.some(
    ({ clientId }) => String(clientId) === String(client.id),
  )) : [];
  const readinessLabel = readiness?.verdict ??
    (readiness?.blocked ? "Blocked" : readiness?.band ?? (readiness?.canStart ? "Ready" : "Not assessed"));
  const start = (label) => newRun && (data.liveAccess || canRun || needsFirstRunSetup(client, readiness)
    ? <WorkflowLink href={newRun} primary>{label}</WorkflowLink>
    : <Button primary disabled>{label}</Button>);

  if (showSetup && client) {
    return <BrandSetupHome client={client} data={data} agent={agent} readiness={readiness} team={team} href={href} />;
  }

  const pending = (data.reviewDecisions ?? []).filter((review) => review.status === "pending" &&
    String(review.clientId) === String(client?.id));
  const attention = [
    ...pending.map((review) => {
      const plan = review.gate === "gate_1";
      const run = data.runs.find((item) => item.id === String(review.runId));
      const post = data.posts.find((item) => item.id === String(review.contentItemId));
      return { id: review._id, label: (plan ? "Plan review" : "Post review") + " · " +
        ((plan ? run?.title ?? run?.name : post?.title) ?? (plan ? "Content plan" : "Post")),
        detail: [run?.period, review.requestedAt && homeDate.format(new Date(review.requestedAt))].filter(Boolean).join(" · "),
        link: href(plan ? "plan" : "post", { run: review.runId, ...(plan ? {} : { post: review.contentItemId }) }) };
    }),
    ...tasks.map((task) => ({ id: task.id, label: task.title, detail: task.dueAt,
      link: task.runId && href(task.page ?? "runs", { run: task.runId, post: task.postId }) })),
  ];
  const upcoming = posts.filter(({ scheduledAt, status }) => Date.parse(scheduledAt) >= Date.now() - 86_400_000 &&
    String(status).toLowerCase() !== "cancelled").sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)).slice(0, 7);
  const checks = [
    { key: "profile", label: "Brand profile", detail: "Name, website and time zone",
      ok: Boolean(client?.name && client?.website && client?.timezone) },
    { key: "knowledge", label: "Published knowledge", detail: client?.knowledgeVersion != null
      ? "Version " + client.knowledgeVersion + " is live" : "Approve and publish the brand knowledge", ok: client?.knowledgeVersion != null },
    ...(agentReadiness.length ? agentReadiness.map(([key, report]) => ({ key, label: agentNames.get(key) ?? key,
      detail: report.reason, verdict: report.verdict }))
      : readiness ? [{ key: "readiness", label: "Knowledge readiness", detail: readiness.reason, verdict: readinessLabel }] : []),
  ];
  const verdictTone = { READY: "ok", LIMITED: "warn", BLOCKED: "bad" };
  const memberRoles = (user) => (user.assignments?.[client.id] ?? user.clientAssignments?.find(
    ({ clientId }) => String(clientId) === String(client.id))?.roles ?? []).join(" · ");

  return (
    <main className="brand-home our-home">
      <div className="our-between">
        <div className="our-row">
          <span className="brand-home-mark" aria-hidden="true">{client?.name?.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "V"}</span>
          <div>
            <h1>{client?.name ?? "Brand home"}</h1>
            <p className="muted">{client ? [client.knowledgeVersion != null ? "Knowledge v" + client.knowledgeVersion : "Knowledge not published",
              client.channel, client.timezone ?? "IST"].filter(Boolean).join(" · ") : "Select a brand to view its workspace."}</p>
          </div>
        </div>
        <div className="our-row">
          {href("calendar") && <WorkflowLink href={href("calendar")}>Calendar</WorkflowLink>}
          {start("New run")}
        </div>
      </div>

      <div className="our-g2">
        <section className="card">
          <div className="our-between"><h2>{agent?.name ?? "Social Media Agent"}</h2>
            <Chip tone={canRun ? "ok" : "bad"}>{canRun ? "Can start runs" : "Not ready to run"}</Chip></div>
          <p className="muted">Pre-run checks. The READY, LIMITED or BLOCKED verdict for each stage comes from the agents when a run starts.</p>
          <div className="our-stack">
            {checks.map((check) => (
              <div key={check.key} className="our-between our-top">
                <div><p className="our-strong">{check.label}</p>{check.detail && <p className="muted">{check.detail}</p>}</div>
                {check.verdict
                  ? <Chip tone={verdictTone[check.verdict]}>{check.verdict}</Chip>
                  : <Chip tone={check.ok ? "ok" : "bad"}>{check.ok ? "Pass" : "Needs action"}</Chip>}
              </div>
            ))}
          </div>
          {data.integrations.briefTemplateUrl && (
            <a href={data.integrations.briefTemplateUrl} download>Download brief template (.xlsx)</a>
          )}
        </section>
        <section className="card">
          <div className="our-between"><h2>Needs your attention</h2><Chip>{attention.length} item{attention.length === 1 ? "" : "s"}</Chip></div>
          {!attention.length && <p className="muted">Nothing is waiting for you in this brand.</p>}
          {attention.map((item) => (
            <div key={item.id} className="our-between our-line">
              <div><p className="our-strong">{item.label}</p>{item.detail && <p className="muted">{item.detail}</p>}</div>
              {item.link && <WorkflowLink href={item.link} primary>Review</WorkflowLink>}
            </div>
          ))}
        </section>
      </div>

      <section className="card our-flush">
        <div className="our-between our-pad"><h2>Active runs</h2>{href("runs") && <a href={href("runs")}>All runs</a>}</div>
        <div className="admin-table">
          <table>
            <thead><tr><th>Run</th><th>Period</th><th>Status</th><th>Started by</th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td><a href={href("runs", { run: run.id })}>{run.title ?? run.name ?? "Run " + run.id.slice(-6)}</a></td>
                  <td>{run.period ?? data.briefs?.find(({ id }) => String(id) === String(run.briefId))?.title ?? "—"}</td>
                  <td><Chip tone={statusTone(run.status)}>{statusText(run.status)}</Chip>
                    {(run.progressLabel ?? stageLabels[run.currentStageKey]) && <p className="muted">{run.progressLabel ?? stageLabels[run.currentStageKey]}</p>}</td>
                  <td>{run.ownerName ?? run.owner ?? run.ownerEmail ?? "—"}</td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={4} className="muted">No active runs.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="our-g2">
        <section className="card">
          <div className="our-between"><h2>Coming up</h2>{href("calendar") && <a href={href("calendar")}>Open calendar</a>}</div>
          {!upcoming.length && <p className="muted">No posts scheduled yet.</p>}
          {upcoming.map((post) => (
            <div key={post.id} className="our-between">
              <div><p className="our-strong">{post.title}</p><p className="muted">{homeDate.format(new Date(post.scheduledAt))}</p></div>
              <Chip tone={statusTone(post.displayStatus ?? post.status)}>{post.displayStatus ?? statusText(post.status)}</Chip>
            </div>
          ))}
        </section>
        <section className="card">
          <div className="our-between"><h2>Team</h2>{href("brand-settings") && <a href={href("brand-settings")}>Manage people</a>}</div>
          {team.length ? team.map((user) => (
            <div className="our-row" key={user.email}>
              <span className="our-avatar" aria-hidden="true">{(user.name || user.email)?.[0]?.toUpperCase()}</span>
              <div><p className="our-strong">{user.name || user.email}</p><p className="muted">{memberRoles(user)}</p></div>
            </div>
          )) : <p className="muted">Ask a Brand Manager to see who works on this brand.</p>}
        </section>
      </div>
    </main>
  );
}

const homeDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const calendarZone = "Asia/Kolkata";
const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: calendarZone, dateStyle: "short" });
const calendarTime = new Intl.DateTimeFormat("en-IN", { timeZone: calendarZone, timeStyle: "short" });
const calendarMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const calendarRange = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function offsetDay(day, offset) {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

const agendaDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: calendarZone });

// Content calendar: our day-by-day list of planned, scheduled and live posts (times in IST).
export function ContentCalendar({ data, client, href, action, canAct = () => true }) {
  const [range, setRange] = useState("Upcoming");
  const [agent, setAgent] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const brandPosts = client ? data.posts.filter((post) => post.clientId === client.id && Number.isFinite(Date.parse(post.scheduledAt)))
    .map((post) => ({ ...post, status: post.displayStatus ?? post.status })) : [];
  const runs = new Map(data.runs.filter((run) => run.clientId === client?.id).map((run) => [run.id, run]));
  const agentOf = (post) => post.agentId ?? runs.get(post.runId)?.agentId;
  const agents = [...new Set(brandPosts.map(agentOf).filter(Boolean))];
  const tones = { Scheduled: "b", Verified: "g", Live: "g", Published: "g", "Published (unverified)": "g", "Awaiting approval": "b", Planned: "a", Blocked: "r", Failed: "r", Cancelled: "r" };
  const today = dateKey.format(new Date());
  const posts = brandPosts.filter((post) => (!agent || agentOf(post) === agent) &&
    (range === "Upcoming" ? dateKey.format(new Date(post.scheduledAt)) >= today : dateKey.format(new Date(post.scheduledAt)) < today))
    .sort((a, b) => (Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)) * (range === "Upcoming" ? 1 : -1));
  const days = [];
  for (const post of posts) {
    const key = dateKey.format(new Date(post.scheduledAt));
    if (days.at(-1)?.key !== key) days.push({ key, label: agendaDay.format(new Date(post.scheduledAt)), posts: [] });
    days.at(-1).posts.push(post);
  }

  function cancel(post) {
    const reason = window.prompt("Cancel this scheduled post? Enter a reason to confirm.");
    if (reason?.trim()) submit("cancelScheduledPost", { postId: post.id, runId: post.runId, reason: reason.trim() });
  }

  return (
    <Page className="content-calendar" title="Content calendar"
      description={(client ? client.name + " · " : "") + "Planned, scheduled and live posts · times in IST"}
      actions={<>
        {agents.length > 1 && <select aria-label="Filter by agent" value={agent} onChange={(event) => setAgent(event.target.value)}>
          <option value="">All agents</option>
          {agents.map((id) => <option key={id} value={id}>{configuredAgent(data, id)?.name ?? id}</option>)}
        </select>}
        <Tabs values={["Upcoming", "Past"]} value={range} onChange={setRange} />
      </>}>
      {feedback}
      {!days.length && <Card><p className="muted">{range === "Upcoming" ? "No posts scheduled from today onwards." : "No earlier posts."}</p></Card>}
      {days.map((day) => (
        <Card key={day.key} title={day.label + (day.key === today ? " · Today" : "")}>
          {day.posts.map((post) => (
            <div key={post.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--app-border, #e4ddcf)" }}>
              <div style={{ minWidth: 0 }}>
                {href("post") ? <a href={href("post", { run: post.runId, post: post.id })}><strong>{post.title ?? "Open post"}</strong></a> : <strong>{post.title}</strong>}
                <p className="muted" style={{ margin: "2px 0 0" }}>{[calendarTime.format(new Date(post.scheduledAt)),
                  runs.get(post.runId)?.title, post.destination === "linkedin" ? "LinkedIn" : post.destination].filter(Boolean).join(" · ")}</p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <Chip tone={tones[post.status]}>{post.status}</Chip>
                {post.status === "Scheduled" && runs.has(post.runId) && canAct("cancelScheduledPost", runs.get(post.runId)) &&
                  <Button disabled={busy} onClick={() => cancel(post)}>Cancel</Button>}
              </div>
            </div>
          ))}
        </Card>
      ))}
    </Page>
  );
}
