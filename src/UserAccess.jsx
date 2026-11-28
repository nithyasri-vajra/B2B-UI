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
  "Brand Manager",
  "Approver",
  "Operator",
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

function EditAccess({ user, clients, clientName, action, onClose, onSave, clientsLoadError, saveNotice }) {
  const [draft, setDraft] = useState({
    ...user,
    assignments: user.assignments ?? {},
  });
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [clientsError, setClientsError] = useState(clientsLoadError);
  const { submit, busy, feedback } = useAction(async (name, payload) => {
    const result = await action(name, payload);
    if (name === "saveUserAccess" && result) onSave(result.message || "User access saved.");
    return result;
  });
  const effectiveRoles = userRoles(draft);
  const globalChanged = Boolean(draft.global) !== Boolean(user.global);


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
      { before: user, after, reason, confirmed },
    );
  }

  return (
    <Page
      className="activity-people-screen person-access-screen"
      title={user.name || user.email}
      description={[user.email, user.status, user.last && "Last sign-in " + user.last].filter(Boolean).join(" · ")}
      actions={<Button onClick={onClose}>Back to People</Button>}
    >
      {saveNotice && <p role="status">{saveNotice.message}</p>}
      <form className="admin-form person-access-form" onSubmit={save}>
        <div className="person-access-controls">
        {user.note && <Card title="Request note"><p>{user.note}</p></Card>}
        <Card title="Roles in your brands">
          <p className="muted">Select the roles this person should hold in each brand.</p>
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
            empty="No clients available to assign."
            headers={["Brand", ...brandRoleBadges.map(([, label]) => label)]}
            rows={clients.map((client) => [
              clientName(client),
              ...roles
                .slice(1)
                .map((role) => (
                  <input
                    aria-label={clientName(client) + " " + role}
                    type="checkbox"
                    disabled={busy}
                    checked={draft.assignments[client]?.includes(role) ?? false}
                    onChange={(e) => assign(client, role, e.target.checked)}
                  />
                )),
            ])}
          />
        </Card>
        <Card title="Platform access">
          <label>
            <input type="checkbox" checked={Boolean(draft.global)}
              disabled={busy}
              onChange={(event) => {
                setDraft({ ...draft, global: event.target.checked });
                setConfirmed(false);
              }}
            />{" "}
            <strong>Platform Admin</strong>{" "}
            <span className="muted">{descriptions[0]}</span>
          </label>
          {globalChanged && (
            <>
              <Field label="Reason for changing Platform Admin access">
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Confirm Platform Admin access change
              </label>
            </>
          )}
        </Card>
        </div>
        <Card title="What this person can do">
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
          </ul>
        </Card>
        <div className="admin-actions">
          <Button
            primary
            type="submit"
            disabled={
              busy || Boolean(clientsError) ||
              (globalChanged && (!confirmed || !reason.trim())) ||
              (user.status === "Pending role" && !effectiveRoles.length)
            }
          >
            {busy ? "Saving…" : "Save access"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
        {feedback}
      </form>
    </Page>
  );
}

import "./activity-people.css";

const brandRoleBadges = [["Brand Manager", "Brand Manager", "BM"], ["Approver", "Approver", "AP"], ["Operator", "Operator", "OP"], ["Viewer", "Viewer", "VW"]];

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
  const [view, setView] = useState(showRequests ? "Access requests" : "People");
  const [editing, setEditing] = useState(null);
  const [usersError, setUsersError] = useState(data.usersLoadError);
  const [usersLoading, setUsersLoading] = useState(false);
  useEffect(() => {
    if (!data.liveAccess) return;
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
  }, [action, data.liveAccess]);
  const [filters, setFilters] = useState({
    search: "",
    role: "All",
    client: "All",
    status: "All",
  });
  const [preAdd, setPreAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);
  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);
  const { submit, busy, feedback } = useAction(async (name, payload) => {
    const result = await action(name, payload);
    if (result?.message && name !== "loadUsers") {
      setSaveNotice({ message: result.message });
      return { ...result, message: undefined };
    }
    return result;
  });
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
        saveNotice={saveNotice}
        clientsLoadError={data.clientsLoadError && !availableClients.length ? data.clientsLoadError : null}
        onClose={() => setEditing(null)}
        onSave={(message) => {
          setSaveNotice({ message });
          setEditing(null);
          setView("Users");
        }}
      />
    );
  return (
    <Page
      className="activity-people-screen"
      title="People"
      description="Platform Admin · Google Workspace access"
      actions={
        ["People", "Users"].includes(view) && (
          <Button primary disabled={usersLoading || busy} onClick={() => setPreAdd(!preAdd)}>
            {view === "People" ? "Add person to brands" : "Pre-add email"}
          </Button>
        )
      }
    >
      {saveNotice && <p role="status">{saveNotice.message}</p>}
      {usersError && <p role="alert">{usersError}</p>}
      {data.liveAccess && (
        <Button disabled={busy || usersLoading} onClick={() =>
          submit("loadUsers", {}, () => setUsersError(null))
        }>
          Refresh users
        </Button>
      )}
      <Tabs
        values={["People", "Users", "Access requests", "Roles reference"]}
        value={view}
        onChange={setView}
      />
      {["People", "Users"].includes(view) && (
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
                <Button primary type="submit" disabled={busy || usersLoading}>
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
            {view === "People" ? <>
              <div className="people-role-legend">
                {brandRoleBadges.map(([role, label, badge]) => <span key={role}><Chip>{badge}</Chip> {label}</span>)}
              </div>
              <Table headers={["Person", ...availableClients.map(({ name }) => name)]}
                rows={filtered.map((user) => [
                  <div>
                    <Button disabled={busy || usersLoading} onClick={() => setEditing(user)}>{user.name || user.email}</Button>
                    <div className="muted">{user.email === data.session?.email ? "You" : user.status}</div>
                  </div>,
                  ...clients.map((id) => {
                    const badges = brandRoleBadges.filter(([role]) => user.assignments?.[id]?.includes(role));
                    return badges.length ? badges.map(([role, label, badge]) => <span key={role} title={label}><Chip>{badge}</Chip>{" "}</span>) : "—";
                  }),
                ])}
                empty="No people match these filters."
              />
            </> : <Table
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
                  <Button disabled={busy || usersLoading} onClick={() => setEditing(user)}>Edit access</Button>
                  {user.status === "Active" && (
                    <Button
                      disabled={busy || usersLoading}
                      onClick={() => {
                        if (window.confirm("Suspend " + user.name + "?"))
                          submit("suspendUser", { email: user.email, confirmed: user.global });
                      }}
                    >
                      Suspend
                    </Button>
                  )}
                  {!user.global &&
                    userClients(user, clients).map((client) => (
                      <Button
                        key={client}
                        disabled={busy || usersLoading}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove " + user.name + " from " + client + "?",
                            )
                          )
                            submit("removeUserFromClient", {
                              email: user.email,
                              client,
                            });
                        }}
                      >
                        Remove from {clientName(client)}
                      </Button>
                    ))}
                </div>,
              ])}
              empty="No users match these filters."
            />}
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
                <Button disabled={busy || usersLoading} onClick={() => setEditing(user)}>
                  Assign role and clients
                </Button>
                <Button
                  disabled={busy || usersLoading}
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
