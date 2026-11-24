import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createAdminStore } from "./adminData";
import { createAuthServices } from "./authServices";
import AdminApp, { adminPages } from "./AdminApp";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { createPreviewStore } from "./createPreviewStore";
import { restorePreviewStore } from "./previewStorage";
import { ContentCalendar, OperatorHome, WorkflowShell } from "./OperatorHome";
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
const landingPages = {
  "Platform Admin": "overview",
  "Knowledge Admin": "readiness",
  Approver: "approvals",
  Viewer: "calendar",
};

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
  const [selection, setSelection] = useState("");
  const [route, query] = location.split("?", 2);
  const page =
    Object.hasOwn(screens, route) ||
    adminPages.includes(route) ||
    route === "sign-in"
      ? route
      : defaultPage;
  const params = new URLSearchParams(query);
  const session = data.session;
  const signedIn = session?.status === "active";
  const platformAdmin = session?.role === "Platform Admin";
  const allowedClients = session?.clientIds ?? [];
  const clients = data.clients.filter(
    (item) =>
      !item.archived &&
      (!requireSignIn || platformAdmin || allowedClients.includes(item.id)),
  );
  const client = clients.find((item) => item.id === (params.get("client") ?? selection)) ?? clients[0];
  const knowledgeEditor = !requireSignIn || platformAdmin || session?.role === "Knowledge Admin";
  const run =
    client &&
    data.runs.find(
      (item) => item.clientId === client.id && item.id === params.get("run"),
    );
  const post =
    run &&
    data.posts.find(
      (item) =>
        item.clientId === client.id &&
        item.runId === run.id &&
        item.id === params.get("post"),
    );
  const adminPage = adminPages.includes(page);
  const canOpenAdmin =
    !requireSignIn ||
    platformAdmin ||
    (session?.role === "Knowledge Admin" &&
      ["setup", "readiness", "records"].includes(page)) ||
    (page === "readiness" &&
      ["Approver", "Marketing Operator"].includes(session?.role));

  useEffect(() => {
    if (signedIn && page === "sign-in")
      navigate(landingPages[session.role] ?? "home");
  }, [signedIn, page, session?.role]);

  const action = useCallback(async (name, payload) => {
    const result = await store.dispatch(name, {
      clientId: client?.id,
      ...payload,
    });
    if (result?.redirectUrl) followAuthRedirect(result.redirectUrl);
    if (name === "signOut" && result !== false) navigate("sign-in");
    return result;
  }, [store, client?.id]);

  if (page === "sign-in" || (requireSignIn && !signedIn)) {
    return (
      <div className="b2b-admin">
        <SignIn
          key={session?.status ?? "anonymous"}
          data={data}
          action={action}
        />
      </div>
    );
  }
  if (adminPage && canOpenAdmin) {
    return (
      <AdminApp
        page={page}
        onRedirect={followAuthRedirect}
        selectedClientId={params.get("client") ?? selection}
        store={store}
        onKnowledgePublished={(clientId) => navigate("home", { client: clientId })}
        hrefFor={(file, target) =>
          target || earlierLinks[file]
            ? workflowHref(target ?? earlierLinks[file])
            : file
        }
      />
    );
  }

  const view = adminPage ? "home" : page;
  const Screen = screens[view] ?? OperatorHome;
  const clientHref = (target, parameters) => workflowHref(target, { client: client?.id, ...parameters });
  const clientNavigate = (target, parameters) => navigate(target, { client: client?.id, ...parameters });
  const onClientChange = (id) => {
    setSelection(id);
    navigate(view === "plan" || view === "post" ? "approvals" : view, { client: id });
  };
  return (
    <WorkflowShell
      page={view}
      data={data}
      clients={clients}
      client={client}
      onClientChange={onClientChange}
      href={clientHref}
    >
      <Screen
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
        link={(file) => ({
          href: clientHref(file === "RecordReview.dc.html" ? "records" : "setup"),
        })}
        onPublished={() => navigate("home", { client: client?.id })}
      />
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
      let accessNotice;
      if (data.session?.status === "active") {
        const query = new URLSearchParams(window.location.search);
        if (query.has("accessReauthenticated") && data.session.role === "Platform Admin") {
          query.delete("accessReauthenticated");
          history.replaceState(null, "", window.location.pathname +
            (query.size ? "?" + query : "") + window.location.hash);
          try {
            const saved = await auth.resumeAccess();
            accessNotice = saved?.message;
          } catch (error) {
            accessNotice = error.message;
          }
        }
        try {
          data.clients = await auth.readClients();
        } catch {
          data.clientsLoadError = "Could not load clients.";
        }
        if (data.session.role === "Platform Admin") {
          try {
            data.users = (await auth.services.loadUsers()).data.users;
          } catch (error) {
            data.usersLoadError = error.message;
          }
        }
      }
      data.liveAccess = true;
      data.accessNotice = accessNotice;
      const store = createAdminStore(data, auth.services);
      root.render(
        <B2BAgents
          store={store}
          defaultPage={landingPages[data.session?.role] ?? "home"}
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
} else if (mount) {
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
}
