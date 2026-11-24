import { useEffect, useState } from "react";
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

const roles = [
  "Platform Admin",
  "Knowledge Admin",
  "Approver",
  "Marketing Operator",
  "Viewer",
];
const descriptions = [
  "Manage users, roles, SSO, agent configuration and audit.",
  "Build and approve client knowledge.",
  "Approve plans when requested and approve posts for publishing.",
  "Upload briefs, run agents, edit drafts and request approval.",
  "Read runs, posts and reports.",
];
const statuses = ["Active", "Pending role", "Suspended", "Deactivated in IdP"];
const matrix = [
  ["Sign in, see assigned clients", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["Create / archive a client", "Yes", "—", "—", "—", "—"],
  ["Upload knowledge sources", "Yes", "Yes", "—", "—", "—"],
  ["Edit and approve knowledge records", "—", "Yes", "—", "—", "—"],
  ["See knowledge readiness score", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["Open knowledge records (read)", "Yes", "Yes", "Yes", "Yes", "—"],
  ["Upload period brief, start agent run", "—", "—", "Yes", "Yes", "—"],
  ["Edit plan items and post drafts", "—", "—", "Yes", "Own", "—"],
  ["Approve content plan (Gate 1)", "—", "—", "When requested", "Own", "—"],
  ["Ask an Approver to also approve the plan", "—", "—", "—", "Own", "—"],
  ["Approve posts for publishing (Gate 2)", "—", "—", "Yes", "—", "—"],
  ["Set LinkedIn test profile at Gate 2", "—", "—", "Yes", "—", "—"],
  [
    "Connect own LinkedIn profile for test publishing",
    "Yes",
    "—",
    "Yes",
    "Yes",
    "—",
  ],
  ["Hold / cancel a scheduled post", "Yes", "—", "Yes", "Own", "—"],
  ["Cancel a run", "Yes", "—", "Yes", "Own", "—"],
  ["Manage users and roles", "Yes", "—", "—", "—", "—"],
  ["Configure agents and skill versions", "Yes", "—", "—", "—", "—"],
  ["View skill files or prompts", "—", "—", "—", "—", "—"],
  ["View audit log", "Yes", "Own client", "Own client", "—", "—"],
  ["Manage LinkedIn integration settings", "Yes", "—", "—", "—", "—"],
];
const userRoles = (user) => [
  ...new Set([
    ...(user.global ? [roles[0]] : []),
    ...Object.values(user.assignments ?? {}).flat(),
  ]),
];
const userClients = (user, clients) =>
  user.global
    ? clients
    : clients.filter((client) => user.assignments?.[client]?.length);

function EditAccess({ user, clients, clientName, action, onClose, onSave, liveAccess, clientsLoadError }) {
  const [draft, setDraft] = useState({
    ...user,
    assignments: user.assignments ?? {},
  });
  const [roleOptions, setRoleOptions] = useState(userRoles(user));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [clientsError, setClientsError] = useState(clientsLoadError);
  const [accessSaved, setAccessSaved] = useState(false);
  const { submit, busy, feedback } = useAction(async (name, payload) => {
    const result = await action(name, payload);
    if (name === "saveUserAccess" && result && !result.redirectUrl) {
      if (result.refreshRequired) setAccessSaved(true);
      else onSave();
    }
    return result;
  });
  const effectiveRoles = userRoles(draft);
  const globalChanged = Boolean(draft.global) !== Boolean(user.global);
  const needsConfirmation = globalChanged || (liveAccess && (draft.global || user.global));

  function selectRole(role, checked) {
    setRoleOptions((current) =>
      checked ? [...current, role] : current.filter((item) => item !== role),
    );
    if (role === roles[0])
      setDraft((current) => ({ ...current, global: checked }));
    else if (!checked)
      setDraft((current) => ({
        ...current,
        assignments: Object.fromEntries(
          Object.entries(current.assignments).map(([client, assigned]) => [
            client,
            assigned.filter((item) => item !== role),
          ]),
        ),
      }));
  }
  function assign(client, role, checked) {
    const assigned = draft.assignments[client] ?? [];
    setDraft({
      ...draft,
      assignments: {
        ...draft.assignments,
        [client]: checked
          ? [...assigned, role]
          : assigned.filter((item) => item !== role),
      },
    });
  }
  function save(event) {
    event.preventDefault();
    const after = {
      ...draft,
      status: user.status === "Pending role" ? "Active" : user.status,
    };
    submit(
      "saveUserAccess",
      { before: user, after, reason, confirmed, requiresStepUp: true },
    );
  }

  return (
    <Page
      title={"Edit user access · " + user.name}
      description={
        user.email +
        " · Google Workspace · " +
        user.status +
        " · Last sign-in " +
        user.last
      }
      actions={<Button onClick={onClose}>Back</Button>}
    >
      <form className="admin-form" onSubmit={save}>
        <Card title="Roles">
          {roles.map((role, i) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={roleOptions.includes(role)}
                onChange={(e) => selectRole(role, e.target.checked)}
              />{" "}
              <strong>{role}</strong>{" "}
              <span className="muted">{descriptions[i]}</span>
            </label>
          ))}
          {(liveAccess || globalChanged) && (
            <>
              <Field label="Reason for access change">
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              {needsConfirmation && <label>
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Confirm Platform Admin access change
              </label>}
            </>
          )}
        </Card>
        <Card title="Client assignments">
          {clientsError && (
            <div>
              <p role="alert">{clientsError}</p>
              <Button type="button" disabled={busy} onClick={() =>
                submit("loadClients", {}, () => setClientsError(null))
              }>
                Retry loading clients
              </Button>
            </div>
          )}
          <Table
            headers={["Client", ...roles.slice(1)]}
            rows={clients.map((client) => [
              clientName(client),
              ...roles
                .slice(1)
                .map((role) => (
                  <input
                    aria-label={clientName(client) + " " + role}
                    type="checkbox"
                    disabled={!roleOptions.includes(role)}
                    checked={draft.assignments[client]?.includes(role) ?? false}
                    onChange={(e) => assign(client, role, e.target.checked)}
                  />
                )),
            ])}
          />
        </Card>
        <Card title="Effective permissions">
          <ul>
            {effectiveRoles.length ? (
              effectiveRoles.map((role) => (
                <li key={role}>
                  {descriptions[roles.indexOf(role)]}
                  {role !== roles[0] &&
                    " Assigned clients: " +
                      clients
                        .filter((client) =>
                          draft.assignments[client]?.includes(role),
                        )
                        .map(clientName)
                        .join(", ") +
                      "."}
                </li>
              ))
            ) : (
              <li>No effective access.</li>
            )}
            {!effectiveRoles.includes("Approver") && (
              <li>Cannot approve posts for publishing.</li>
            )}
            {!draft.global && (
              <li>Cannot manage users or agent configuration.</li>
            )}
            <li>Cannot view skill files or prompts.</li>
          </ul>
        </Card>
        <div className="admin-actions">
          <Button
            primary
            type="submit"
            disabled={
              busy || accessSaved || Boolean(clientsError) ||
              (needsConfirmation && !confirmed) ||
              ((liveAccess || globalChanged) && !reason.trim()) ||
              (user.status === "Pending role" && !effectiveRoles.length)
            }
          >
            Re-authenticate and save
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
        {feedback}
      </form>
    </Page>
  );
}

export function Users({
  action,
  showRequests,
  data,
  clients: availableClients,
}) {
  const items = data.users.filter((user) => user.status !== "Declined");
  const clients = availableClients.map((client) => client.id);
  const clientName = (id) =>
    availableClients.find((client) => client.id === id)?.name ?? id;
  const [view, setView] = useState(showRequests ? "Access requests" : "Users");
  const [editing, setEditing] = useState(null);
  const [usersError, setUsersError] = useState(data.usersLoadError);
  const [usersLoading, setUsersLoading] = useState(false);
  useEffect(() => {
    if (!data.liveAccess || editing) return;
    let current = true;
    setUsersLoading(true);
    action("loadUsers").then(() => {
      if (current) setUsersError(null);
    }).catch((error) => {
      if (current) setUsersError(error.message);
    }).finally(() => {
      if (current) setUsersLoading(false);
    });
    return () => { current = false; };
  }, [action, data.liveAccess, view, editing]);
  const [filters, setFilters] = useState({
    search: "",
    role: "All",
    client: "All",
    status: "All",
  });
  const [preAdd, setPreAdd] = useState(false);
  const [email, setEmail] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const workDomain = data.integrations.google?.domain;
  const set = (name, value) =>
    setFilters((current) => ({ ...current, [name]: value }));
  const pending = items.filter((user) => user.status === "Pending role");
  const filtered = items.filter(
    (user) =>
      (user.name + " " + user.email)
        .toLowerCase()
        .includes(filters.search.toLowerCase()) &&
      (filters.role === "All" || userRoles(user).includes(filters.role)) &&
      (filters.client === "All" ||
        userClients(user, clients).includes(filters.client)) &&
      (filters.status === "All" || user.status === filters.status),
  );

  if (editing)
    return (
      <EditAccess
        user={
          data.users.find((user) => user.email === editing.email) ?? editing
        }
        clients={clients}
        clientName={clientName}
        action={action}
        liveAccess={data.liveAccess}
        clientsLoadError={data.clientsLoadError && !availableClients.length ? data.clientsLoadError : null}
        onClose={() => setEditing(null)}
        onSave={() => setEditing(null)}
      />
    );
  return (
    <Page
      title="Users and roles"
      description="Platform Admin · Google Workspace access"
      actions={
        view === "Users" && (
          <Button primary onClick={() => setPreAdd(!preAdd)}>
            Pre-add email
          </Button>
        )
      }
    >
      {data.accessNotice && <p role="status">{data.accessNotice}</p>}
      {usersError && <p role="alert">{usersError}</p>}
      {data.liveAccess && (
        <Button disabled={busy || usersLoading} onClick={() =>
          submit("loadUsers", {}, () => setUsersError(null))
        }>
          Refresh users
        </Button>
      )}
      <Tabs
        values={["Users", "Access requests", "Roles reference"]}
        value={view}
        onChange={setView}
      />
      {view === "Users" && (
        <>
          {preAdd && (
            <Card title="Pre-add a Google Workspace account">
              <form
                className="admin-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = email.trim().toLowerCase();
                  if (
                    workDomain &&
                    name.split("@")[1] !== workDomain.toLowerCase()
                  ) {
                    event.currentTarget.elements.workEmail.setCustomValidity(
                      "Use the configured work email domain.",
                    );
                    event.currentTarget.reportValidity();
                    return;
                  }
                  if (items.some((user) => user.email === name)) {
                    event.currentTarget.elements.workEmail.setCustomValidity(
                      "This email already exists.",
                    );
                    event.currentTarget.reportValidity();
                    return;
                  }
                  const user = {
                    name,
                    email: name,
                    status: "Pending role",
                    assignments: {},
                    last: "—",
                  };
                  submit("preAddUser", { email: name }, () => {
                    setPreAdd(false);
                    setEmail("");
                    setEditing(user);
                  });
                }}
              >
                <Field label="Work email">
                  <input
                    type="email"
                    name="workEmail"

                    required
                    value={email}
                    onChange={(e) => {
                      e.target.setCustomValidity("");
                      setEmail(e.target.value);
                    }}
                  />
                </Field>
                <Button primary type="submit" disabled={busy}>
                  Continue to assign access
                </Button>
              </form>
            </Card>
          )}
          <Card>
            <div className="admin-actions">
              <Field label="Search by name or email">
                <input
                  type="search"
                  value={filters.search}
                  onChange={(e) => set("search", e.target.value)}
                />
              </Field>
              <Select
                label="Role"
                options={["All", ...roles]}
                value={filters.role}
                onChange={(value) => set("role", value)}
              />
              <Field label="Client">
                <select
                  aria-label="Client filter"
                  value={filters.client}
                  onChange={(event) => set("client", event.target.value)}
                >
                  <option>All</option>
                  {clients.map((id) => (
                    <option key={id} value={id}>
                      {clientName(id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Select
                label="Status"
                options={["All", ...statuses]}
                value={filters.status}
                onChange={(value) => set("status", value)}
              />
            </div>
            <Table
              headers={[
                "Name",
                "Email",
                "Status",
                "Roles",
                "Clients assigned",
                "Last sign-in",
                "Actions",
              ]}
              rows={filtered.map((user) => [
                user.name,
                user.email,
                <Chip tone={user.status === "Active" ? "g" : "a"}>
                  {user.status}
                </Chip>,
                userRoles(user).join(", ") || "—",
                user.global
                  ? "All clients"
                  : userClients(user, clients).map(clientName).join(", ") ||
                    "—",
                user.last,
                <div className="admin-actions">
                  <Button onClick={() => setEditing(user)}>Edit access</Button>
                  {user.status === "Active" && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Suspend " + user.name + "?"))
                          submit("suspendUser", { email: user.email });
                      }}
                    >
                      Suspend
                    </Button>
                  )}
                  {!user.global &&
                    userClients(user, clients).map((client) => (
                      <Button
                        key={client}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove " + user.name + " from " + client + "?",
                            )
                          )
                            submit("removeUserFromClient", {
                              email: user.email,
                              client,
                              requiresStepUp: true,
                            });
                        }}
                      >
                        Remove from {clientName(client)}
                      </Button>
                    ))}
                </div>,
              ])}
              empty="No users match these filters."
            />
          </Card>
        </>
      )}
      {view === "Access requests" && (
        <Card title={"Pending role · " + pending.length}>
          <Table
            headers={[
              "Name",
              "Email",
              "Requested at",
              "Requested client",
              "Note",
              "Actions",
            ]}
            rows={pending.map((user) => [
              user.name,
              user.email,
              user.requestedAt ? new Date(user.requestedAt).toLocaleString() : "-",
              user.requested ? clientName(user.requested) : "—",
              user.note ?? "—",
              <div className="admin-actions">
                <Button onClick={() => setEditing(user)}>
                  Assign role and clients
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Decline this access request?"))
                      submit("declineAccessRequest", { email: user.email, reason: "Declined from access requests." });
                  }}
                >
                  Decline
                </Button>
              </div>,
            ])}
            empty={usersLoading ? "Loading access requests…" : usersError ? "Access requests could not be loaded." : "No pending access requests."}
          />
        </Card>
      )}
      {view === "Roles reference" && (
        <>
          <Card title="Roles">
            <Table
              headers={["Role", "Scope", "Purpose"]}
              rows={roles.map((role, i) => [
                role,
                i === 0 ? "Global" : "Assigned clients",
                descriptions[i],
              ])}
            />
          </Card>
          <Card title="Permission matrix">
            <p className="muted">
              Own applies to runs the operator started. Client-scoped roles
              apply only to assigned clients.
            </p>
            <Table headers={["Capability", ...roles]} rows={matrix} />
          </Card>
        </>
      )}
      {feedback}
    </Page>
  );
}
