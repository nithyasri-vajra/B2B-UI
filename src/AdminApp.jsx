import { useId, useState, useSyncExternalStore } from "react";
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
  onKnowledgePublished,
  selectedClientId,
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
  const clients = data.clients.filter((client) => !client.archived);
  const [selection, setSelection] = useState(selectedClientId ?? "");
  const [showNotifications, setShowNotifications] = useState(false);
  const client = clients.find((item) => item.id === selection) ?? clients[0];
  const notifications = data.notifications.filter(
    (item) => !item.clientId || item.clientId === client?.id,
  );

  async function action(name, payload) {
    const scoped = { clientId: client?.id, ...payload };
    const result = await onAction?.(
      name,
      payload === undefined ? undefined : scoped,
    );
    if (result?.data) source.ingest(result.data);
    if (result !== undefined) return result;
    return source.dispatch(name, scoped);
  }
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

  function link(file) {
    return { href: hrefFor(file, pagesByFile[file]) };
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
          <a className={navClass("Main.dc.html")} {...link("Main.dc.html")}>
            Home
          </a>
          <a
            className={navClass("RunWorkspace.dc.html")}
            {...link("RunWorkspace.dc.html")}
          >
            Runs
          </a>
          <a
            className={navClass("Readiness.dc.html")}
            {...link("Readiness.dc.html")}
          >
            Knowledge
          </a>
          <p className="sec">Admin</p>
          <a
            className={navClass("AdminOverview.dc.html")}
            {...link("AdminOverview.dc.html")}
          >
            Overview
          </a>
          <a className={navClass("#clients")} {...link("#clients")}>
            Clients
          </a>
          <a
            className={navClass("KnowledgeSetup.dc.html")}
            {...link("KnowledgeSetup.dc.html")}
          >
            Knowledge setup
          </a>
          <a
            className={navClass("RecordReview.dc.html")}
            {...link("RecordReview.dc.html")}
          >
            Knowledge records
          </a>
          <a className={navClass("Users.dc.html")} {...link("Users.dc.html")}>
            Users and roles
          </a>
          <a className={navClass("Agents.dc.html")} {...link("Agents.dc.html")}>
            Agents and skills
          </a>
          <a className={navClass("#integrations")} {...link("#integrations")}>
            Integrations
          </a>
          <a
            className={navClass("AuditLog.dc.html")}
            {...link("AuditLog.dc.html")}
          >
            Audit log
          </a>
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
              onChange={(event) => setSelection(event.target.value)}
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
              ["setup", "records", "readiness", "client-settings"].includes(
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
