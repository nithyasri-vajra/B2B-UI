import { useEffect, useRef, useState } from "react";
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
  ["Open knowledge records (read)", "Yes", "Yes", "Yes", "Yes", "—"],
  ["Upload period brief, start agent run", "—", "—", "Yes", "Yes", "—"],
  ["Edit plan items and post drafts", "—", "—", "Yes", "Own", "—"],
  ["Approve content plan (Gate 1)", "—", "—", "As named approver", "Own runs", "—"],
  ["Approve posts for publishing (Gate 2)", "—", "—", "Yes", "—", "—"],
  ["Cancel a scheduled post", "Yes", "—", "Yes", "Own", "—"],
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
        {!user.global && clients.some((client) => user.assignments?.[client]?.length) && user.status !== "Pending role" &&
          <Card title="Remove from a brand">
            <p className="muted">Takes away every role this person has in that brand.</p>
            <div className="our-row">
              {clients.filter((client) => user.assignments?.[client]?.length).map((client) => (
                <Button key={client} disabled={busy} onClick={() => {
                  if (window.confirm("Remove " + (user.name || user.email) + " from " + clientName(client) + "?"))
                    submit("removeUserFromClient", { email: user.email, client }, onClose);
                }}>Remove from {clientName(client)}</Button>
              ))}
            </div>
          </Card>}
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
import { OurDialog } from "./OurUi";

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
  const [view, setView] = useState(showRequests ? "Access requests" : "Everyone");
  const [editing, setEditing] = useState(null);
  const [usersError, setUsersError] = useState(data.usersLoadError);
  const [usersLoading, setUsersLoading] = useState(false);
  // Load people once when the page opens. The action changes identity whenever data changes,
  // so depending on it here reloaded the list in a loop and kept every button disabled.
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    if (!data.liveAccess) return;
    let current = true;
    setUsersLoading(true);
    actionRef.current("loadUsers").then(() => {
      if (current) setUsersError(null);
    }).catch((error) => {
      if (current) setUsersError(error.message);
    }).finally(() => {
      if (current) setUsersLoading(false);
    });
    return () => { current = false; };
  }, [data.liveAccess]);
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
  const tabsList = [["Everyone", "Everyone"], ["Access requests", "Access requests (" + pending.length + ")"],
    ["Active", "Active"], ["Suspended", "Suspended"], ["Roles reference", "Roles reference"]];
  const tabName = view === "People" || view === "Users" ? "Everyone" : view;
  const shown = filtered.filter((user) => tabName === "Everyone" || (tabName === "Access requests" ? user.status === "Pending role"
    : tabName === "Active" ? user.status === "Active" : tabName === "Suspended" ? user.status === "Suspended" : true));
  const statusTone = { Active: "g", "Pending role": "a", Suspended: "r", "Deactivated in IdP": "r" };
  const initialsOf = (value) => String(value ?? "?").trim().split(/[\s@.]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <Page
      className="activity-people-screen"
      title="People"
      description="Everyone who has signed in or been added, their brand roles and access."
      actions={<>
        {data.liveAccess && <Button disabled={busy || usersLoading} onClick={() =>
          submit("loadUsers", {}, () => setUsersError(null))}>Refresh</Button>}
        <Button primary disabled={usersLoading || busy} onClick={() => setPreAdd(true)}>Add person</Button>
      </>}
    >
      {saveNotice && <div className="our-alert ok" role="status">{saveNotice.message}</div>}
      {usersError && <p role="alert">{usersError}</p>}
      <nav className="our-tabs" aria-label="People views">
        {tabsList.map(([key, label]) => <button key={key} type="button" className={"our-tab our-tab-button" + (tabName === key ? " on" : "")}
          aria-pressed={tabName === key} onClick={() => setView(key)}>{label}</button>)}
      </nav>
      {tabName !== "Roles reference" && <section className="card our-flush">
        <div className="our-toolbar">
          <input type="search" aria-label="Search by name or email" placeholder="Search by name or email" value={filters.search}
            onChange={(e) => set("search", e.target.value)} />
          <select aria-label="Role filter" value={filters.role} onChange={(e) => set("role", e.target.value)}>
            <option value="All">Any role</option>{roles.map((role) => <option key={role}>{role}</option>)}
          </select>
          <select aria-label="Client filter" value={filters.client} onChange={(e) => set("client", e.target.value)}>
            <option value="All">All brands</option>{clients.map((id) => <option key={id} value={id}>{clientName(id)}</option>)}
          </select>
        </div>
        <div className="admin-table"><table>
          <thead><tr><th>Person</th><th>Status</th><th>Brand roles</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {shown.map((user) => <tr key={user.email}>
              <td><div className="our-row" style={{ flexWrap: "nowrap" }}>
                <span className="our-avatar" aria-hidden="true">{initialsOf(user.name || user.email)}</span>
                <div><p className="our-strong">{user.name || user.email}{user.global && <> <Chip tone="a">Platform Admin</Chip></>}{user.email === data.session?.email && <span className="muted"> · You</span>}</p>
                  <p className="muted">{user.email}</p>
                  {user.note && <p>“{user.note}”</p>}</div>
              </div></td>
              <td><Chip tone={statusTone[user.status]}>{user.status}</Chip></td>
              <td>{user.global && !userClients(user, clients).some((id) => user.assignments?.[id]?.length) ? <span className="muted">All brands (Platform Admin)</span>
                : clients.filter((id) => user.assignments?.[id]?.length).map((id) => <p key={id}>{clientName(id)}: {user.assignments[id].join(", ")}</p>)}
                {!user.global && !clients.some((id) => user.assignments?.[id]?.length) && <span className="muted">None</span>}</td>
              <td className="muted">{user.last && user.last !== "—" ? user.last : "Never"}</td>
              <td className="our-right"><div className="our-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                <Button disabled={busy || usersLoading} onClick={() => setEditing(user)}>{user.status === "Pending role" ? "Review" : "Edit"}</Button>
                {user.status === "Pending role" && <Button disabled={busy || usersLoading} onClick={() => {
                  if (window.confirm("Decline this access request?"))
                    submit("declineAccessRequest", { email: user.email, reason: "Declined from access requests." });
                }}>Decline</Button>}
                {user.status === "Active" && user.email !== data.session?.email && <Button disabled={busy || usersLoading} onClick={() => {
                  if (window.confirm("Suspend " + (user.name || user.email) + "?"))
                    submit("suspendUser", { email: user.email, confirmed: user.global });
                }}>Suspend</Button>}
              </div></td>
            </tr>)}
            {!shown.length && <tr><td colSpan={5} className="muted">{usersLoading ? "Loading people…" : tabName === "Access requests" ? "No one is waiting for access." : "No people match these filters."}</td></tr>}
          </tbody>
        </table></div>
      </section>}
      {tabName === "Roles reference" && (
        <>
          <Card title="Roles">
            <Table headers={["Role", "Scope", "Purpose"]}
              rows={roles.map((role, i) => [role, i === 0 ? "Global" : "Assigned brands", descriptions[i]])} />
          </Card>
          <Card title="Permission matrix">
            <p className="muted">Own applies to runs the operator started. Brand roles apply only to assigned brands.</p>
            <Table headers={["Capability", ...roles]} rows={matrix} />
          </Card>
        </>
      )}
      {preAdd && <OurDialog title="Add a person" onClose={() => { setPreAdd(false); setEmail(""); }}>
        <form className="our-stack" onSubmit={(event) => {
          event.preventDefault();
          const name = email.trim().toLowerCase();
          const input = event.currentTarget.elements.workEmail;
          if (workDomain && name.split("@")[1] !== workDomain.toLowerCase()) {
            input.setCustomValidity("Use the configured work email domain.");
            event.currentTarget.reportValidity();
            return;
          }
          if (items.some((user) => user.email === name)) {
            input.setCustomValidity("This email already exists.");
            event.currentTarget.reportValidity();
            return;
          }
          const user = { name, email: name, status: "Pending role", assignments: {}, last: "—" };
          submit("preAddUser", { email: name }, () => { setPreAdd(false); setEmail(""); setEditing(user); });
        }}>
          <label>Work email<input type="email" name="workEmail" required value={email}
            onChange={(e) => { e.target.setCustomValidity(""); setEmail(e.target.value); }} /></label>
          <p className="muted">Next you choose their roles in each brand. They get access the first time they sign in with Google.</p>
          <div><Button primary type="submit" disabled={busy || usersLoading}>Continue to roles</Button></div>
        </form>
      </OurDialog>}
      {feedback}
    </Page>
  );
}
