import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  Page,
  Table,
  Tabs,
  useAction,
} from "./AdminControls";

import "./brand-settings.css";

export function Clients({
  action,
  create,
  settings,
  client,
  clients: items,
  data,
  link,
}) {
  const [index, setIndex] = useState(
    create ? -1 : settings ? (client?.id ?? null) : null,
  );
  const [tab, setTab] = useState("Profile");
  const [draft, setDraft] = useState(
    create ? { timezone: "Asia/Kolkata", language: "English" } : (client ?? {}),
  );
  const { submit, busy, feedback } = useAction(action);

  function open(i) {
    setIndex(i < 0 ? -1 : items[i].id);
    setTab("Profile");
    setDraft(
      i < 0
        ? { timezone: "Asia/Kolkata", language: "English" }
        : { ...items[i] },
    );
  }
  function change(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  function save(event) {
    event.preventDefault();
    const creating = index === -1;
    submit(
      creating ? "createClient" : "saveClientSettings",
      { clientId: creating ? undefined : index, tab, values: draft },
      () => {
        if (creating) setIndex(null);
      },
    );
  }
  const text = (key, label, type = "text", required = false) => (
    <Field label={label}>
      <input
        type={type}
        value={draft[key] ?? ""}
        required={required}
        onChange={(e) => change(key, e.target.value)}
      />
    </Field>
  );
  const brandSettings = index !== null && index !== -1;
  const configured = data.agents.find((agent) => agent.id === draft.agentId);
  const brandAgents = data.liveAccess ? draft.agents ?? [] : [];
  const readiness = data.readiness.find((report) => report.clientId === index);
  const members = data.users.filter((user) => user.assignments?.[index]?.length);
  const managersAvailable = data.users.filter((user) => user.status === "Active" && user.id != null);
  const profiles = (data.integrations.linkedin?.profiles ?? []).filter((profile) => profile.clientId === index);
  const roles = [["Brand Manager", "Brand Manager"], ["Approver", "Approver"], ["Operator", "Operator"], ["Viewer", "Viewer"]];
  const approvers = members.filter((member) => member.assignments[index].includes("Approver"));
  function approverField(key, label) {
    const current = draft[key] ?? "";
    return (
      <Field label={label}>
        <select value={current} onChange={(event) => change(key, event.target.value)}>
          <option value="">Select approver</option>
          {current && !approvers.some(({ id, email }) => (data.liveAccess ? id : email) === current) && <option value={current}>{current}</option>}
          {approvers.map(({ id, email, name }) => <option key={email} value={data.liveAccess ? id : email}>{name ?? email}</option>)}
        </select>
      </Field>
    );
  }
  const channelCard = (
    <Card title="Channels">
      {data.liveAccess ? <Table headers={["Channel", "Status"]}
        rows={(draft.channels ?? []).map((channel) => typeof channel === "string" ? [channel, "-"] : [
          channel.name ?? channel.type ?? "-", channel.status ?? "-",
        ])} empty="No channels configured for this brand." /> : <>
      <p><strong>{draft.channel ?? "LinkedIn"}</strong>{" "}
        <Chip tone={draft.linked ? "g" : "a"}>{draft.linked ? "Connected" : "Not connected"}</Chip>
      </p>
      <p>Page ID: {draft.pageId ?? "-"} · Token expiry: {draft.tokenExpiry ?? "-"}</p>
      <Button disabled={busy || data.liveAccess} onClick={() => submit("reconnectClientLinkedIn", { clientId: index })}>
        Reconnect
      </Button>
      </>}
      <Button onClick={() => setTab("Agents")}>Manage agents</Button>
    </Card>
  );
  const brandTable = (
    <Card>
      <Table
        headers={["Brand", "Brand Manager", "People", "Readiness", "Knowledge", "Last run", "Status", ""]}
        rows={items.map((brand, i) => {
          const members = data.users.filter((user) => user.assignments?.[brand.id]?.length);
          const managers = members.filter((user) => user.assignments[brand.id].includes("Brand Manager"));
          const report = data.readiness.find((item) => item.clientId === brand.id);
          const last = brand.last ?? data.runs.filter((run) => run.clientId === brand.id)
            .map((run) => run.startedAt).filter(Boolean).sort().at(-1);
          return [
            <div><strong>{brand.name}</strong><div className="muted">{brand.channel}</div></div>,
            managers.map((user) => user.name ?? user.email).join(", ") || "Unassigned",
            members.length,
            report?.score ?? report?.band ?? "-",
            brand.knowledge ?? brand.knowledgeVersion ?? "-",
            last ?? "-",
            <Chip tone={brand.archived ? undefined : "g"}>{brand.archived ? "Archived" : brand.status ?? "Active"}</Chip>,
            <Button onClick={() => open(i)}>Settings</Button>,
          ];
        })}
        empty="No brand spaces yet."
      />
    </Card>
  );
  if (index === -1 || items.some((item) => item.id === index))
    return (
      <Page
        className="brand-settings-screen"
        title={brandSettings ? "Brand settings" : "Brand spaces"}
        description={brandSettings ? client?.id === index ? client.name : items.find((item) => item.id === index)?.name : undefined}
        actions={
          <Button onClick={() => setIndex(null)}>Back to clients</Button>
        }
      >
        {brandSettings && <Tabs values={["Profile and channels", "Agents", "Members", "Approvals and publishing", "Archive"]}
          value={{ Profile: "Profile and channels", Team: "Members", Governance: "Approvals and publishing" }[tab] ?? tab}
          onChange={(value) => setTab({ "Profile and channels": "Profile", Members: "Team", "Approvals and publishing": "Governance" }[value] ?? value)} />}
        {brandSettings && <a href={"#audit?" + new URLSearchParams({ client: index, scope: "brand" })}>Activity log</a>}
        {tab === "Team" && <Card title="Add people">
          <p className="muted">Add work accounts or update brand assignments in Users and roles.</p>
          {link && <a className="btn pri" {...link("Users.dc.html")}>Open Users and roles</a>}
        </Card>}
        <div className={!brandSettings ? "brand-spaces-layout" : ["Profile", "Governance"].includes(tab) ? "brand-settings-profile" : undefined}>
        {!brandSettings && brandTable}
        <Card title={!brandSettings ? "Create brand space" : tab === "Agents" ? "Agents for " + draft.name : tab === "Governance" ? "Default approvers" : tab === "Team" ? "Members" : tab}>
          {tab === "Profile" || tab === "Governance" ? (
            <form className="admin-form" onSubmit={save}>
              <div className="admin-grid">
                {tab === "Profile" ? (
                  <>
                    {text("name", brandSettings ? "Brand name" : "Client name", "text", true)}
                    {text("website", "Website", "url", index === -1 && data.liveAccess)}
                    {text("industry", "Industry")}
                    {text("timezone", "Timezone", "text", index === -1 && data.liveAccess)}
                    {text("language", data.liveAccess ? "Spelling" : "Language")}
                    {index === -1 && data.liveAccess && <Field label="Brand Manager">
                      <select required value={draft.brandManagerUserId ?? ""} onChange={(event) => change("brandManagerUserId", event.target.value)}>
                        <option value="">Select an active user</option>
                        {managersAvailable.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
                      </select>
                      {!managersAvailable.length && <span className="muted">No active users with an ID are available.</span>}
                    </Field>}
                  </>
                ) : (
                  <>
                    {approverField(data.liveAccess ? "defaultApproverUserId" : "approver", "Named approver")}
                    {approverField(data.liveAccess ? "backupApproverUserId" : "backup", "Backup approver")}
                    {data.liveAccess ? <p className="muted">LinkedIn publishing is unavailable.</p> : <>
                    {text("start", "Publishing window starts", "time")}
                    {text("end", "Publishing window ends", "time")}
                    {text("timezone", "Timezone")}
                    {text("blackouts", "Blackout dates")}
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.separation)}
                        onChange={(e) => change("separation", e.target.checked)}
                      />{" "}
                      Separation of duties
                    </label>
                    </>}
                  </>
                )}
              </div>
              <Button primary type="submit" disabled={busy}>
                {index === -1 ? "Create brand space" : "Save changes"}
              </Button>
            </form>
          ) : null}
          {tab === "Agents" && (
            <Table headers={["Agent", "Enabled", "Readiness", "Approver", "Output goes to", ""]}
              rows={data.liveAccess ? brandAgents.map((agent) => [
                agent.name ?? agent.agentKey, agent.enabled ? "On" : "Off", agent.readiness ?? "-",
                data.users.find((user) => user.id === agent.approverUserId)?.name ?? "-",
                agent.destination ?? "-", "-",
              ]) : configured ? [[
                <strong>{configured.name ?? configured.id}</strong>,
                <Chip tone={configured.enabled === false ? undefined : "g"}>{configured.enabled === false ? "Off" : "On"}</Chip>,
                readiness?.band ?? "Not assessed",
                draft.approver ?? "—",
                draft.channel ?? "—",
                configured.briefTemplateUrl && <a href={configured.briefTemplateUrl} download>Brief template</a>,
              ]] : []}
              empty="No agent configured for this brand."
            />
          )}
          {tab === "Team" && (
            <Table
              headers={["Member", ...roles.map(([, label]) => label)]}
              rows={members.map((user) => ({ key: user.email, cells: [
                <div><strong>{user.name ?? user.email}</strong>{user.name && <div className="muted">{user.email}</div>}</div>,
                ...roles.map(([role]) => user.assignments[index].includes(role) ? "✓" : "—"),
              ] }))}
              empty="No users assigned."
            />
          )}
          {tab === "Archive" && (
            <Button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Archive " + draft.name + "?"))
                  submit("archiveClient", { clientId: index }, () => {
                    setIndex(null);
                  });
              }}
            >
              Archive client
            </Button>
          )}
          {feedback}
        </Card>
        {brandSettings && tab === "Profile" && channelCard}
        {brandSettings && tab === "Governance" && <Card title="LinkedIn test profiles">
          <Table headers={["Profile", "Connection", "Publishing"]}
            rows={profiles.map((profile) => ({ key: profile.id, cells: [
              profile.name ?? profile.id,
              <Chip tone={profile.connected ? "g" : undefined}>{profile.connected ? "Connected" : "Not connected"}</Chip>,
              profile.eligible === false ? "Unavailable" : profile.connected ? "Allowed" : "Not connected",
            ] }))}
            empty="No brand-specific LinkedIn test profiles configured."
          />
          {link && <a {...link("#integrations")}>Open integrations</a>}
        </Card>}
        </div>
      </Page>
    );
  return (
    <Page
      className="brand-settings-screen"
      title="Brand spaces"
      description="Platform Admin · all clients"
      actions={
        <Button primary onClick={() => open(-1)}>
          Create brand space
        </Button>
      }
    >
      {data.clientsLoadError && <p role="alert">{data.clientsLoadError}</p>}
      {brandTable}
    </Page>
  );
}

const stepNames = {
  "social-content-orchestrator": "Orchestrator", "context-assembler": "Context Assembler", "brief-qualifier": "Brief Qualifier",
  "content-planner": "Content Planner", gate_1: "Plan approval (Gate 1)", "post-writer": "Post Writer",
  "post-quality-analyst": "Post Quality Analyst", gate_2: "Post approval (Gate 2)",
};
const limitNames = { maxPostsPerRun: "Posts per run", maxPeriodDays: "Days per brief period" };

// Our Agents page on live data: each agent's pipeline and whether its skills are configured.
function LiveAgents({ action }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    let active = true;
    actionRef.current("loadAgents").then((value) => { if (active) setResult(value); })
      .catch((reason) => { if (active) setError(reason.message || "Could not load agents."); });
    return () => { active = false; };
  }, []);
  const agents = result?.agents ?? [];
  const skills = result?.skills ?? {};
  const skill = (key) => skills[key];
  return (
    <Page className="brand-settings-screen platform-agents-screen" title="Agents and skills"
      description="Agent workflows and whether each skill is configured on the server. Skill files and IDs stay on the server and are never shown here.">
      {error && <p role="alert">{error}</p>}
      {!result && !error && <p className="muted">Loading agents…</p>}
      {result && !agents.length && <Card><p className="muted">No agents configured yet.</p></Card>}
      {agents.map((agent) => {
        const version = agent.versions?.find((entry) => entry.version === agent.currentVersion) ?? agent.versions?.at(-1);
        const steps = [...(version?.pipeline ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const orchestrator = skill("social-content-orchestrator");
        return <section key={agent.agentKey ?? agent._id} className="card">
          <div className="our-between"><h2>{agent.name ?? agent.agentKey}</h2>
            <div className="our-row"><Chip tone={agent.releaseStatus === "live" ? "g" : "a"}>{agent.releaseStatus ?? "—"}</Chip>
              {version && <Chip>Version {version.version}</Chip>}</div></div>
          {agent.outputType && <p className="muted">Produces: {agent.outputType}</p>}
          <div>
            {orchestrator && <div className="our-between our-line"><div><p className="our-strong">Orchestrator</p>
              <p className="muted">Runs once per run and prepares the context for each stage.</p></div>
              <Chip tone={orchestrator.configured ? "g" : "r"}>{orchestrator.configured ? "Skill ready · v" + orchestrator.version : "Skill not configured"}</Chip></div>}
            {steps.map((step, index) => {
              const status = skill(step.stageKey);
              return <div key={step.stageKey} className="our-between our-line">
                <p className="our-strong">{index + 1}. {stepNames[step.stageKey] ?? step.stageKey}</p>
                {step.gate ? <Chip>Human approval</Chip>
                  : status ? <Chip tone={status.configured ? "g" : "r"}>{status.configured ? "Skill ready · v" + status.version : "Skill not configured"}</Chip>
                  : <Chip>App step</Chip>}
              </div>;
            })}
          </div>
          {version?.runLimits && <p className="muted">{Object.entries(version.runLimits).map(([key, value]) => (limitNames[key] ?? key) + ": " + value).join(" · ")}</p>}
        </section>;
      })}
      {result?.openai && <section className="card">
        <div className="our-between"><h2>OpenAI</h2><Chip tone={result.openai.apiKey && result.openai.model ? "g" : "r"}>{result.openai.apiKey && result.openai.model ? "Connected" : "Not set up"}</Chip></div>
        <p>Model: {result.openai.model ?? <span className="muted">not set</span>} · API key {result.openai.apiKey ? "set" : "not set"}</p>
      </section>}
    </Page>
  );
}

export function Agents(props) {
  return props.data.liveAccess ? <LiveAgents {...props} /> : <PreviewAgents {...props} />;
}

function PreviewAgents({ action, data }) {
  const [selected, setSelected] = useState(null);
  const active = data.agents.find((agent) => agent.id === selected) ?? data.agents[0];
  return (
    <Page
      className="brand-settings-screen platform-agents-screen"
      title="Agents and skills"
      description="Review configured pipelines, skill versions and run limits."
    >
      {!data.agents.length && (
        <Card>
          <p className="muted">No agents configured yet.</p>
        </Card>
      )}
      {active && <div className="platform-agents-layout">
        <Card>
          <div className="platform-agent-picker" aria-label="Choose agent">
            {data.agents.map((agent) => (
              <button className="btn" key={agent.id} type="button"
                aria-pressed={agent.id === active.id} onClick={() => setSelected(agent.id)}>
                <strong>{agent.name ?? agent.id}</strong>
                {agent.status && <Chip>{agent.status}</Chip>}
              </button>
            ))}
          </div>
        </Card>
        <div className="platform-agent-detail">
          {data.agents.map((agent) => (
            <div key={agent.id} hidden={agent.id !== active.id}>
              <Agent agent={agent} action={action} />
            </div>
          ))}
        </div>
      </div>}
    </Page>
  );
}

function Agent({ agent, action }) {
  const [draft, setDraft] = useState({});
  const limits = { ...agent.limits, ...draft };
  const { submit, busy, feedback } = useAction(action);
  return (
    <div className="platform-agent-panels">
    <Card title={[agent.name ?? agent.id, agent.version].filter(Boolean).join(" · ")}>
      <div className="admin-row">
        <p>
          <Chip>{agent.status ?? "—"}</Chip>{" "}
          <Chip>{agent.readiness ?? "—"}</Chip> {agent.reason}
        </p>
        {agent.availableVersion && agent.availableVersion !== agent.version && (
          <Button
            disabled={busy}
            onClick={() =>
              submit("enableAgentVersion", {
                id: agent.id,
                version: agent.availableVersion,
              })
            }
          >
            Enable v{agent.availableVersion} for new runs
          </Button>
        )}
      </div>
    </Card>
    <Card title="Pipeline">
      <Table
        headers={["Step", "Skill", "Version", "Readiness"]}
        rows={(agent.pipeline ?? []).map((step) => [
          step.name,
          step.skill ?? "—",
          step.version ?? "—",
          step.readiness ?? "—",
        ])}
        empty="No pipeline steps configured."
      />
    </Card>
    <Card title="Gate settings and run limits">
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit("saveAgentLimits", { id: agent.id, limits }, () =>
            setDraft({}),
          );
        }}
      >
        <div className="admin-actions">
          <label>
            <input type="checkbox" checked disabled /> Gate 1 · Plan approval
          </label>
          <label>
            <input type="checkbox" checked disabled /> Gate 2 · Post approval
          </label>
        </div>
        <div className="admin-grid">
          {[
            ["qaRounds", "QA revision rounds", 0],
            ["maxPosts", "Maximum posts per run", 1],
            ["cost", "Cost limit per run", 0],
            ["time", "Time limit per run (minutes)", 1],
          ].map(([key, label, min]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                min={min}
                max={key === "maxPosts" ? 40 : undefined}
                step={key === "cost" ? "0.01" : "1"}
                value={limits[key] ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </Field>
          ))}
        </div>
        <Button primary type="submit" disabled={busy}>
          Save limits
        </Button>
      </form>
      {feedback}
    </Card>
    </div>
  );
}

export function Integrations({ action, data }) {
  const { submit, busy, feedback } = useAction(action);
  const { linkedin, storage, google, email } = data.integrations;
  return (
    <Page
      className="brand-settings-screen"
      title="Integrations"
      description="Connections and service status for this platform."
    >
      <div className="platform-integrations-layout">
      <Card title="LinkedIn">
        <div className="admin-row">
          <p>
            API app <Chip>{linkedin?.status ?? "Not configured"}</Chip>
          </p>
          <Button
            disabled={busy || !linkedin}
            onClick={() => submit("testLinkedInConnection")}
          >
            Test connection
          </Button>
        </div>
        <p className="muted">Company page · Not used for publishing in pilot</p>
        <h2>Connected test profiles</h2>
        <Table
          headers={["Person", "Connected on", "Token expiry", ""]}
          rows={(linkedin?.profiles ?? []).map((profile) => [
            profile.name,
            profile.connectedAt ?? "—",
            profile.expiresAt ?? "—",
            <Button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Revoke this LinkedIn test profile?"))
                  submit("revokeLinkedInTestProfile", { id: profile.id });
              }}
            >
              Revoke
            </Button>,
          ])}
          empty="No test profiles connected."
        />
        {feedback}
      </Card>
        <Card title="Google Workspace sign-in">
          <p>Domain · {google?.domain ?? "—"}</p>
          <p>Group mapping · {google?.groupMapping ?? "Not configured"}</p>
          <p>Directory API sync · {google?.syncStatus ?? "—"}</p>
        </Card>
        <Card title="File storage">
          <p>{storage?.status ?? "Not configured"}</p>
        </Card>
        <Card title="Email notifications">
          <p>{email?.status ?? "Not configured"}</p>
        </Card>
      </div>
    </Page>
  );
}
