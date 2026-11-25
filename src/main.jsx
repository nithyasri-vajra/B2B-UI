import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createAdminStore } from "./adminData";
import { createAuthServices } from "./authServices";
import AdminApp, { adminPages } from "./AdminApp";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { createPreviewStore } from "./createPreviewStore";
import { restorePreviewStore } from "./previewStorage";
import { ContentCalendar, OperatorHome, WorkflowShell } from "./OperatorHome";
import { canOpenPage, canPerformAction, hasAccess, isPlatformAdmin, landingPage, rolesForClient } from "./access";
import SignIn from "./SignIn";
import NewRun from "./NewRun";
import RunWorkspace from "./RunWorkspace";
import PlanReview from "./PlanReview";
import PostReview from "./PostReview";
import ApprovalsQueue from "./ApprovalsQueue";

const screens = {
  home: OperatorHome,
  knowledge: KnowledgeReadiness,
  "new-run": NewRun,
  runs: RunWorkspace,
  plan: PlanReview,
  post: PostReview,
  approvals: ApprovalsQueue,
  calendar: ContentCalendar,
};
const earlierLinks = { "Main.dc.html": "home", "RunWorkspace.dc.html": "runs" };

function subscribe(callback) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function getLocation() {
  return window.location.hash.slice(1);
}

export function workflowHref(page, parameters = {}) {
  const search = new URLSearchParams(
    Object.entries(parameters).filter(
      ([, value]) => value != null && value !== "",
    ),
  );
  return "#" + page + (search.size ? "?" + search.toString() : "");
}
function navigate(page, parameters) {
  window.location.hash = workflowHref(page, parameters);
}

function followAuthRedirect(redirectUrl) {
  const target = new URL(redirectUrl, window.location.origin);
  if (target.protocol !== "https:" && target.origin !== window.location.origin)
    throw new Error("Invalid sign-in redirect.");
  window.location.assign(target.href);
}

export function B2BAgents({
  store,
  requireSignIn = true,
  defaultPage = "home",
  preview = false,
}) {
  const location = useSyncExternalStore(subscribe, getLocation);
  const data = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const [route, query] = location.split("?", 2);
  const params = new URLSearchParams(query);
  const session = data.session?.status === "active" && !hasAccess(data.session)
    ? { ...data.session, status: "pending" }
    : data.session;
  const signedIn = session?.status === "active";
  const platformAdmin = isPlatformAdmin(session);
  const clients = data.clients.filter((item) => !item.archived &&
    (!requireSignIn || platformAdmin || rolesForClient(session, item.id).length));
  const requestedClient = params.get("client");
  const client = requestedClient === null ? clients[0] :
    clients.find((item) => item.id === requestedClient);
  const allowed = (target, id = client?.id) =>
    !requireSignIn || canOpenPage(session, id, target);
  const landing = (id) => requireSignIn ? landingPage(session, id) : defaultPage;
  const page = route || landing(client?.id) || defaultPage;
  const knowledgeEditor = !requireSignIn || rolesForClient(session, client?.id).includes("knowledge_admin");
  const run =
    client &&
    data.runs.find(
      (item) => item.clientId === client.id && item.id === params.get("run"),
    );
  const pageAllowed = (requestedClient === null || Boolean(client)) && allowed(page) &&
    (!requireSignIn || page !== "new-run" || !params.has("run") ||
      canPerformAction(session, client?.id, "replaceBrief", run));
  const post =
    run &&
    data.posts.find(
      (item) =>
        item.clientId === client.id &&
        item.runId === run.id &&
        item.id === params.get("post"),
    );
  const adminPage = adminPages.includes(page);
  const landingTarget = landing(client?.id);
  useEffect(() => {
    if (signedIn && page === "sign-in" && landingTarget)
      navigate(landingTarget, { client: client?.id });
  }, [signedIn, page, landingTarget, client?.id]);

  const action = useCallback(async (name, payload = {}) => {
    const targetClient = client?.id;
    const actionRun = payload.runId === undefined ? undefined : data.runs.find(
      (item) => item.clientId === targetClient && item.id === payload.runId,
    );
    if (requireSignIn && (
      (payload.runId !== undefined && !actionRun) ||
      (!platformAdmin && payload.clientId != null && payload.clientId !== targetClient) ||
      !canPerformAction(session, targetClient, name, actionRun)
    )) throw new Error("You do not have permission to perform this action.");
    const scopedClient = name === "loadAudit" && platformAdmin
      ? undefined
      : !requireSignIn || platformAdmin ? payload.clientId ?? targetClient : targetClient;
    const result = await store.dispatch(name, { ...payload, clientId: scopedClient });
    if (result?.redirectUrl) followAuthRedirect(result.redirectUrl);
    if (name === "signOut" && result !== false) navigate("sign-in");
    return result;
  }, [store, client?.id, data.runs, requireSignIn, session, platformAdmin]);

  if (page === "sign-in" || (requireSignIn && !signedIn)) {
    return (
      <div className="b2b-admin">
        <SignIn
          key={session?.status ?? "anonymous"}
          data={{ ...data, session }}
          action={action}
        />
      </div>
    );
  }
  const onClientChange = (id) => {
    const target = ["plan", "post"].includes(page) ? "runs" : page;
    navigate(allowed(target, id) ? target : landing(id) ?? "home", { client: id });
  };
  if (adminPage && pageAllowed) {
    return (
      <AdminApp
        page={page}
        onRedirect={followAuthRedirect}
        selectedClientId={client?.id}
        scopedClients={requireSignIn ? clients : undefined}
        onClientChange={requireSignIn ? onClientChange : undefined}
        canOpen={allowed}
        readOnly={!knowledgeEditor}
        scopedAudit={requireSignIn && !platformAdmin}
        onAction={requireSignIn ? action : undefined}
        store={store}
        onKnowledgePublished={(clientId) => navigate(requireSignIn ? landing(clientId) ?? "home" : "home", { client: clientId })}
        hrefFor={(file, target) =>
          target || earlierLinks[file]
            ? workflowHref(target ?? earlierLinks[file], { client: requireSignIn ? client?.id : undefined })
            : file
        }
      />
    );
  }

  const view = page;
  const Screen = screens[view] ?? OperatorHome;
  const clientHref = (target, parameters) => allowed(target) ? workflowHref(target, { client: client?.id, ...parameters }) : undefined;
  const clientNavigate = (target, parameters) => navigate(target, { client: client?.id, ...parameters });
  return (
    <WorkflowShell
      page={view}
      data={data}
      clients={clients}
      client={client}
      onClientChange={onClientChange}
      href={clientHref}
    >
      {pageAllowed ? <Screen
        key={[view, client?.id, run?.id, post?.id].join(":")}
        data={data}
        client={client}
        run={run}
        post={post}
        action={action}
        href={clientHref}
        navigate={clientNavigate}
        preview={preview}
        readOnly={view === "knowledge" && !knowledgeEditor}
        canAct={(name, targetRun = run) => !requireSignIn || canPerformAction(session, client?.id, name, targetRun)}
        link={(file) => ({
          href: clientHref(file === "RecordReview.dc.html" ? "records" : "setup"),
        })}
        onPublished={() => navigate(requireSignIn ? landingTarget ?? "home" : "home", { client: client?.id })}
      /> : <p role="alert">You do not have access to this page for the selected client.</p>}
    </WorkflowShell>
  );
}

const mount = document.getElementById("root");
const authApiPath = import.meta.env.VITE_AUTH_API_PATH;
if (mount && authApiPath) {
  const root = createRoot(mount);

  async function loadSession() {
    root.render(<p role="status">Checking your session…</p>);
    try {
      const auth = createAuthServices(authApiPath);
      const data = await auth.readSession();
      if (data.session?.status === "active") {
        try {
          data.clients = await auth.readClients();
        } catch {
          data.clientsLoadError = "Could not load clients.";
        }
        if (isPlatformAdmin(data.session)) {
          try {
            data.users = (await auth.services.loadUsers()).data.users;
          } catch (error) {
            data.usersLoadError = error.message;
          }
        }
      }
      data.liveAccess = true;
      const store = createAdminStore(data, auth.services);
      root.render(
        <B2BAgents
          store={store}
        />,
      );
    } catch {
      root.render(
        <div>
          <p role="alert">Could not check your session.</p>
          <button type="button" onClick={loadSession}>Try again</button>
        </div>,
      );
    }
  }

  loadSession();
} else if (mount && import.meta.env.DEV) {
  const previewStore = createPreviewStore();
  const root = createRoot(mount);
  function renderPreview(storageUnavailable = false) {
    root.render(
      <>
        {storageUnavailable && (
          <p role="alert">Browser storage is unavailable. Preview changes may be lost on refresh.</p>
        )}
        <B2BAgents
          store={previewStore}
          requireSignIn={false}
          preview
          defaultPage={previewStore.getSnapshot().clients.some((client) => client.knowledgeVersion) ? "home" : "overview"}
        />
      </>,
    );
  }
  restorePreviewStore(previewStore, () => renderPreview(true)).then(
    () => renderPreview(),
    () => renderPreview(true),
  );
} else if (mount) {
  createRoot(mount).render(<p role="alert">Sign-in is unavailable. Authentication is not configured.</p>);
}
