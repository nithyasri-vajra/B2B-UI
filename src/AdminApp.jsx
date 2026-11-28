import { Fragment, useCallback, useId, useState, useSyncExternalStore } from "react";
import AdminOverview from "./AdminOverview";
import KnowledgeSetup from "./KnowledgeSetup";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { Clients, Agents, Integrations } from "./PlatformSettings";
import { Records } from "./KnowledgeRecords";
import { Users } from "./UserAccess";
import { AuditLog } from "./AuditLog";
import "./admin.css";
import { AppShell } from "./AppShell";
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
  logout,
  profileHref,
  onKnowledgePublished,
  selectedClientId,
  scopedClients,
  onClientChange,
  session,
  brandsHref,
  approvalsHref,
  onSignOut,
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

  const shellHref = (target) => canOpen(target) ? hrefFor(null, target) : undefined;
  return (
    <AppShell page={page} session={session ?? data.session} clients={clients} client={client}
      onClientChange={onClientChange ?? setSelection} href={shellHref} platformHref={shellHref}
      brandsHref={brandsHref} approvalsHref={approvalsHref ?? shellHref("approvals")}
      profileHref={profileHref} onSignOut={onSignOut}>
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
    </AppShell>
  );
}
