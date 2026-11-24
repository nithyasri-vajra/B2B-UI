import { Fragment, useCallback, useId, useState, useSyncExternalStore } from "react";
import AdminOverview from "./AdminOverview";
import KnowledgeSetup from "./KnowledgeSetup";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { Clients, Agents, Integrations } from "./PlatformSettings";
import { Records } from "./KnowledgeRecords";
import { Users } from "./UserAccess";
import { AuditLog } from "./AuditLog";
import "./admin.css";
import { createAdminStore } from "./adminData";

const pagesByFile = {
  "AdminOverview.dc.html": "overview",
  "KnowledgeSetup.dc.html": "setup",
  "Readiness.dc.html": "readiness",
  "#clients": "clients",
  "#new-client": "new-client",
  "#settings": "client-settings",
  "RecordReview.dc.html": "records",
  "Users.dc.html": "users",
  "#access-requests": "requests",
  "Agents.dc.html": "agents",
  "#integrations": "integrations",
  "AuditLog.dc.html": "audit",
};

const screens = {
  overview: AdminOverview,
  setup: KnowledgeSetup,
  readiness: KnowledgeReadiness,
  clients: Clients,
  "new-client": Clients,
  "client-settings": Clients,
  records: Records,
  users: Users,
  requests: Users,
  agents: Agents,
  integrations: Integrations,
  audit: AuditLog,
};

export const adminPages = Object.keys(screens);

export default function AdminApp({
  page = "overview",
  hrefFor = (file, targetPage) => (targetPage ? "#" + targetPage : file),
  onAction,
  onRedirect,
  onKnowledgePublished,
  selectedClientId,
  scopedClients,
  onClientChange,
  canOpen = () => true,
  readOnly = false,
  scopedAudit = false,
  store,
}) {
  const clientId = useId();
  const [localStore] = useState(createAdminStore);
  const source = store ?? localStore;
  const data = useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getSnapshot,
  );
  const clients = scopedClients ?? data.clients.filter((client) => !client.archived);
  const [selection, setSelection] = useState(selectedClientId ?? "");
  const [showNotifications, setShowNotifications] = useState(false);
  const client = clients.find((item) => item.id === (onClientChange ? selectedClientId : selection)) ?? clients[0];
  const notifications = data.notifications.filter(
    (item) => !item.clientId || item.clientId === client?.id,
  );

  const action = useCallback(async (name, payload) => {
    const scoped = { clientId: client?.id, ...payload };
    if (onClientChange && onAction) return onAction(name, scoped);
    const result = await onAction?.(name, payload === undefined ? undefined : scoped);
    if (result?.data) source.ingest(result.data);
    const outcome = result === undefined ? await source.dispatch(name, scoped) : result;
    if (outcome?.redirectUrl) onRedirect?.(outcome.redirectUrl);
    return outcome;
  }, [source, client?.id, onAction, onRedirect, onClientChange]);
  const Screen = screens[page] ?? AdminOverview;
  const activeNav =
    {
      "new-client": "clients",
      "client-settings": "clients",
      requests: "users",
    }[page] ?? page;

  function navClass(file) {
    return pagesByFile[file] === activeNav ? "nav on" : "nav";
  }

  function link(file, target = pagesByFile[file]) {
    return { href: hrefFor(file, target) };
  }

  return (
    <div className="b2b-admin">
      <div className="app">
        <nav className="side" aria-label="Main">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "4px 12px 16px",
            }}
          >
            <div
              className="ph"
              style={{ width: "28px", height: "28px", fontSize: "10px" }}
            >
              V
            </div>
            <strong style={{ fontSize: "15px" }}>B2B Agents</strong>
          </div>
          {[
            ["Main.dc.html", "home", "Home"],
            ["RunWorkspace.dc.html", "runs", "Runs"],
            ["Readiness.dc.html", "readiness", "Knowledge"],
            ...(onClientChange ? [["#approvals", "approvals", "Approvals"], ["#calendar", "calendar", "Content calendar"]] : []),
            ["AdminOverview.dc.html", "overview", "Overview"],
            ["#clients", "clients", "Clients"],
            ["KnowledgeSetup.dc.html", "setup", "Knowledge setup"],
            ["RecordReview.dc.html", "records", "Knowledge records"],
            ["Users.dc.html", "users", "Users and roles"],
            ["#access-requests", "requests", "Access requests"],
            ["Agents.dc.html", "agents", "Agents and skills"],
            ["#integrations", "integrations", "Integrations"],
            ["AuditLog.dc.html", "audit", "Audit log"],
          ].filter(([, target]) => canOpen(target)).map(([file, target, label]) => (
            <Fragment key={file}>
              {target === "overview" && <p className="sec">Admin</p>}
              <a className={navClass(file)} {...link(file, target)}>{label}</a>
            </Fragment>
          ))}
        </nav>
        <div className="main">
          <header className="top">
            <div style={{ flexGrow: "1" }} />
            <label className="muted" htmlFor={clientId}>
              Client
            </label>
            <select
              id={clientId}
              value={client?.id ?? ""}
              disabled={!clients.length}
              onChange={(event) => (onClientChange ?? setSelection)(event.target.value)}
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                className="ph"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  fontSize: "11px",
                }}
              >
                {data.session?.name?.[0] ?? "—"}
              </div>
              <div>
                <p style={{ fontSize: "13px", fontWeight: "600" }}>
                  {data.session?.name ?? "No session"}
                </p>
                <p className="muted" style={{ fontSize: "12px" }}>
                  {data.session?.role ?? "—"}
                </p>
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
          <Screen
            link={link}
            key={
              ["setup", "records", "readiness", "client-settings", "audit"].includes(
                page,
              )
                ? page + ":" + (client?.id ?? "")
                : page
            }
            onPublished={() => onKnowledgePublished?.(client?.id)}
            create={page === "new-client"}
            settings={page === "client-settings"}
            showRequests={page === "requests"}
            action={action}
            readOnly={readOnly}
            scopedAudit={scopedAudit}
            data={data}
            clients={clients}
            client={client}
            onFiles={(files, domain) =>
              action("uploadSources", { files, domain })
            }
          />
        </div>
      </div>
    </div>
  );
}
