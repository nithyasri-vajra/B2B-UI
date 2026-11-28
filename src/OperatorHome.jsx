import { useId, useState } from "react";
import { Button, Card, Chip, Page, Tabs, useAction } from "./AdminControls";
import { AppShell } from "./AppShell";
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
  const [query, setQuery] = useState("");
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
  const weekStart = offsetDay(today, -((new Date(today).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => offsetDay(weekStart, index));
  const posts = scope(data.posts).filter(({ scheduledAt }) => Number.isFinite(Date.parse(scheduledAt)));
  const visible = (title) => String(title ?? "").toLowerCase().includes(query.trim().toLowerCase());
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

  return (
    <main className="brand-home">
      <div className="brand-home-heading">
        <span className="brand-home-mark" aria-hidden="true">{client?.name?.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "V"}</span>
        <div>
          <h1>{client?.name ?? "Brand home"}</h1>
          <p>{client ? [client.channel, client.timezone ?? "IST"].filter(Boolean).join(" · ") : "Select a client to view your workspace."}</p>
        </div>
        <div className="brand-home-actions">
          <WorkflowLink href={href("calendar")}>Calendar</WorkflowLink>
          {start("New run")}
        </div>
      </div>
      <section aria-labelledby="brand-home-agents">
        <div className="brand-home-section-heading">
          <h2 id="brand-home-agents">Agents</h2>
          {href("agents") && <a href={href("agents")}>Manage agents</a>}
        </div>
        <div className="brand-home-agents">
          <Card title={agent?.name ?? "Agent workflows"}>
            {agent?.description && <p>{agent.description}</p>}
            {agentReadiness.length ? agentReadiness.map(([key, report]) => (
              <div key={key}>
                {agentNames.get(key) ?? key} <Chip>{report.verdict}</Chip>
                {report.reason && <p>{report.reason}</p>}
              </div>
            )) : <>
              <div><Chip>{readinessLabel}</Chip></div>
              {readiness?.reason && <p>{readiness.reason}</p>}
            </>}
            {readiness?.preview && !canRun && !readiness.reason && (
              <p>{readiness.canPublish ? "Publish knowledge to start a run." : "Approve the five knowledge files to continue."}</p>
            )}
            {start("Start run")}
            {data.integrations.briefTemplateUrl && (
              <a href={data.integrations.briefTemplateUrl} download>Download brief template (.xlsx)</a>
            )}
          </Card>
        </div>
      </section>
      <label className="brand-home-search">
        <span>Search brand activity</span>
        <input type="search" placeholder="Search tasks, runs and posts" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="brand-home-columns">
        <div className="brand-home-stack">
          <Card title="Needs your attention">
            {tasks.filter(({ title }) => visible(title)).map((task) => (
              <div key={task.id} className="brand-home-task">
                <div><strong>{task.title}</strong>{task.dueAt && <p>{task.dueAt}</p>}</div>
                {task.runId && <WorkflowLink href={href(task.page ?? "runs", { run: task.runId, post: task.postId })}>{task.page === "plan" ? "Review plan" : task.page === "post" ? "Review post" : "Open run"}</WorkflowLink>}
              </div>
            ))}
            {!tasks.some(({ title }) => visible(title)) && <p>{query ? "No matching tasks." : "No tasks waiting for you."}</p>}
          </Card>
          <Card title="Active runs">
            {href("runs") && <a href={href("runs")}>All runs</a>}
            <div className="brand-home-runs">
              {runs.filter((run) => visible(run.name ?? run.period ?? run.id)).map((run) => (
                <div key={run.id}>
                  <strong>{run.name ?? run.period ?? run.id}</strong> <Chip>{run.status}</Chip>
                  {run.currentStep && <p>{run.currentStep}</p>}
                  {run.progressLabel && <p>{run.progressLabel}</p>}
                  <WorkflowLink href={href("runs", { run: run.id })}>Open run</WorkflowLink>
                </div>
              ))}
            </div>
            {!runs.some((run) => visible(run.name ?? run.period ?? run.id)) && <p>{query ? "No matching runs." : "No active runs."}</p>}
          </Card>
          <Card title="This week">
            {href("calendar") && <a href={href("calendar")}>Open calendar</a>}
            <div className="brand-home-week">
              {week.map((date) => {
                const key = dateKey.format(date);
                return <div key={key} aria-current={key === today ? "date" : undefined}>
                  <strong>{new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: calendarZone }).format(date)}</strong>
                  {posts.filter((post) => dateKey.format(new Date(post.scheduledAt)) === key && visible(post.title)).map((post) => (
                    <div className="brand-home-post" key={post.id}><Chip>{post.status}</Chip><span>{post.title}</span><small>{calendarTime.format(new Date(post.scheduledAt))}</small></div>
                  ))}
                </div>;
              })}
            </div>
          </Card>
        </div>
        <div className="brand-home-stack">
          <Card title="Knowledge">
            <div className="brand-home-score"><Chip>{readinessLabel}</Chip></div>
            {href("knowledge") && <a href={href("knowledge")}>View knowledge</a>}
          </Card>
          <Card title="Team">
            {team.length ? team.map((user) => (
              <div className="brand-home-member" key={user.email}>
                <span className="brand-home-mark" aria-hidden="true">{(user.name || user.email)?.[0]?.toUpperCase()}</span>
                <strong>{user.name || user.email}</strong>
              </div>
            )) : <p>No team details are available in this workspace.</p>}
          </Card>
        </div>
      </div>
    </main>
  );
}

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
