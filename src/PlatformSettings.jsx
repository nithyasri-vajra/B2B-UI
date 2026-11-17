import { useState } from "react";
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

const tabs = ["Profile", "Channels", "Governance", "Team", "Archive"];

export function Clients({
  action,
  create,
  settings,
  client,
  clients: items,
  data,
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
  if (index === -1 || items.some((item) => item.id === index))
    return (
      <Page
        title={
          index === -1 ? "Create client" : "Client settings · " + draft.name
        }
        actions={
          <Button onClick={() => setIndex(null)}>Back to clients</Button>
        }
      >
        {index >= 0 && <Tabs values={tabs} value={tab} onChange={setTab} />}
        <Card title={tab}>
          {tab === "Profile" || tab === "Governance" ? (
            <form className="admin-form" onSubmit={save}>
              <div className="admin-grid">
                {tab === "Profile" ? (
                  <>
                    {text("name", "Client name", "text", true)}
                    {text("website", "Website", "url")}
                    {text("industry", "Industry")}
                    {text("timezone", "Timezone")}
                    {text("language", "Language")}
                  </>
                ) : (
                  <>
                    {text("approver", "Approver")}
                    {text("backup", "Backup approver")}
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
                  </>
                )}
              </div>
              <Button primary type="submit" disabled={busy}>
                {index === -1 ? "Create client" : "Save changes"}
              </Button>
            </form>
          ) : null}
          {tab === "Channels" && (
            <>
              <p>
                LinkedIn page ·{" "}
                <Chip tone={draft.linked ? "g" : "a"}>
                  {draft.linked ? "Connected" : "Not connected"}
                </Chip>
              </p>
              <p>
                Page ID: {draft.pageId ?? "—"} · Token expiry:{" "}
                {draft.tokenExpiry ?? "—"}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  submit("reconnectClientLinkedIn", { clientId: index })
                }
              >
                Reconnect
              </Button>
            </>
          )}
          {tab === "Team" && (
            <Table
              headers={["User", "Role"]}
              rows={data.users
                .filter((user) => user.assignments?.[index]?.length)
                .map((user) => [
                  user.name ?? user.email,
                  user.assignments[index].join(", "),
                ])}
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
      </Page>
    );
  return (
    <Page
      title="Clients"
      description="Platform Admin · all clients"
      actions={
        <Button primary onClick={() => open(-1)}>
          Create client
        </Button>
      }
    >
      <Card>
        <Table
          headers={[
            "Client",
            "Channels",
            "Readiness",
            "Knowledge",
            "Knowledge Admins",
            "Approver / backup",
            "Last run",
            "",
          ]}
          rows={items.map((client, i) => [
            <strong>{client.name}</strong>,
            client.channel,
            <Chip tone={(client.readiness ?? "").includes("Green") ? "g" : "a"}>
              {data.readiness.find((item) => item.clientId === client.id)
                ?.band ?? "—"}
            </Chip>,
            client.knowledge,
            data.users
              .filter((user) =>
                user.assignments?.[client.id]?.includes("Knowledge Admin"),
              )
              .map((user) => user.name ?? user.email)
              .join(", ") || "Unassigned",
            (client.approver ?? "—") + " / " + (client.backup ?? "—"),
            client.last,
            <Button onClick={() => open(i)}>Settings</Button>,
          ])}
        />
      </Card>
    </Page>
  );
}

export function Agents({ action, data }) {
  return (
    <Page
      title="Agents and skills"
      description="Platform Admin · pipeline, versions and limits"
    >
      {!data.agents.length && (
        <Card>
          <p className="muted">No agents configured yet.</p>
        </Card>
      )}
      {data.agents.map((agent) => (
        <Agent key={agent.id} agent={agent} action={action} />
      ))}
    </Page>
  );
}

function Agent({ agent, action }) {
  const [draft, setDraft] = useState({});
  const limits = { ...agent.limits, ...draft };
  const { submit, busy, feedback } = useAction(action);
  return (
    <Card title={agent.name}>
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
      <h2>Gate settings and run limits</h2>
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
  );
}

export function Integrations({ action, data }) {
  const { submit, busy, feedback } = useAction(action);
  const { linkedin, storage, google, email } = data.integrations;
  return (
    <Page
      title="Integrations"
      description="Platform Admin · connections and service status"
    >
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
      <div className="admin-grid">
        <Card title="File storage">
          <p>{storage?.status ?? "Not configured"}</p>
        </Card>
        <Card title="Google Workspace sign-in">
          <p>Domain · {google?.domain ?? "—"}</p>
          <p>Group mapping · {google?.groupMapping ?? "Not configured"}</p>
          <p>Directory API sync · {google?.syncStatus ?? "—"}</p>
        </Card>
        <Card title="Email notifications">
          <p>{email?.status ?? "Not configured"}</p>
        </Card>
      </div>
    </Page>
  );
}
