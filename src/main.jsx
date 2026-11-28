import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createAdminStore } from "./adminData";
import { createAuthServices } from "./authServices";
import AdminApp, { adminPages } from "./AdminApp";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { createPreviewStore } from "./createPreviewStore";
import { restorePreviewStore } from "./previewStorage";
import { ContentCalendar, needsFirstRunSetup, OperatorHome, WorkflowShell } from "./OperatorHome";
import BrandSettings from "./BrandSettings";
import JobsAdmin from "./JobsAdmin";
import { canOpenPage, canPerformAction, hasAccess, isPlatformAdmin, landingPage, rolesForClient } from "./access";
import SignIn from "./SignIn";
import NewRun from "./NewRun";
import RunWorkspace from "./RunWorkspace";
import PlanReview from "./PlanReview";
import PostReview from "./PostReview";
import ApprovalsQueue from "./ApprovalsQueue";
import MyBrands from "./MyBrands";
import { MyProfile, Outputs } from "./BrandViews";
import { Button, useAction } from "./AdminControls";
import { LiveApprovals, LivePlan, LivePost } from "./LiveWorkflow";
import "./our-theme.css";

function LogoutButton({ action }) {
  const { submit, busy, feedback } = useAction(action);
  return (
    <div>
      <Button disabled={busy} onClick={() => submit("signOut")}>
        {busy ? "Logging out…" : "Logout"}
      </Button>
      {feedback}
    </div>
  );
}

const screens = {
  home: OperatorHome,
  knowledge: KnowledgeReadiness,
  "new-run": NewRun,
  runs: RunWorkspace,
  plan: PlanReview,
  post: PostReview,
  approvals: ApprovalsQueue,
  calendar: ContentCalendar,
  profile: MyProfile,
  outputs: Outputs,
  "brand-settings": BrandSettings,
  jobs: JobsAdmin,
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
  const approvalsClient = clients.find(({ id }) => allowed("approvals", id));
  const approvalsHref = approvalsClient
    ? workflowHref("approvals", { client: approvalsClient.id })
    : undefined;
  const landing = (id) => requireSignIn ? landingPage(session, id) : defaultPage;
  const brandsAllowed = requireSignIn && signedIn && (platformAdmin || clients.length > 1);
  const initialPage = brandsAllowed ? "my-brands" : signedIn && requireSignIn && client ? "home" : landing(client?.id);
  const page = route || initialPage || defaultPage;
  const brandAudit = page === "audit" && params.get("scope") === "brand";
  const knowledgeEditor = !requireSignIn || platformAdmin || rolesForClient(session, client?.id).includes("brand_manager");
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
  const landingTarget = initialPage;
  const [detailError, setDetailError] = useState("");
  const detailProject = page === "post" ? post?.projectId : run?.projectId;
  const detailId = page === "post" ? post?.id : run?.id;
  useEffect(() => {
    setDetailError("");
    if (!data.liveAccess || !pageAllowed || !detailProject || !detailId || !["runs", "post", "plan"].includes(page)) return;
    let active = true;
    const request = page === "post"
      ? ["loadPostDetail", { projectId: detailProject, postId: detailId }]
      : ["loadRunDetail", { projectId: detailProject, runId: detailId }];
    store.dispatch(...request).catch((error) => { if (active) setDetailError(error.message); });
    return () => { active = false; };
  }, [data.liveAccess, pageAllowed, page, detailProject, detailId, store]);
  useEffect(() => {
    if (signedIn && page === "sign-in" && landingTarget)
      navigate(landingTarget, landingTarget === "my-brands" ? {} : { client: client?.id });
  }, [signedIn, page, landingTarget, client?.id]);

  const action = useCallback(async (name, payload = {}) => {
    const targetClient = client?.id;
    const actionRun = payload.runId === undefined ? undefined : data.runs.find(
      (item) => item.clientId === targetClient && item.id === payload.runId,
    );
    const scopedRole = rolesForClient(session, targetClient);
    const assignedReview = data.reviewDecisions?.find((review) => review._id === payload.reviewId &&
      String(review.clientId) === targetClient && String(review.projectId) === payload.projectId);
    const livePermissions = {
      addKnowledgeSource: platformAdmin || scopedRole.includes("brand_manager"),
      createKnowledgeRecord: platformAdmin || scopedRole.includes("brand_manager"),
      reviseKnowledgeRecord: platformAdmin || scopedRole.includes("brand_manager"),
      decideReview: Boolean(assignedReview),
      requestPlanApproval: Boolean(actionRun && scopedRole.some((role) => ["approver", "operator"].includes(role))),
      savePostDraft: Boolean(actionRun && data.posts.some((item) => item.id === payload.postId && item.runId === actionRun.id) &&
        scopedRole.some((role) => ["approver", "operator"].includes(role))),
      regeneratePost: Boolean(actionRun && data.posts.some((item) => item.id === payload.postId && item.runId === actionRun.id) &&
        scopedRole.some((role) => ["approver", "operator"].includes(role))),
      refreshApprovals: true,
      loadPostDetail: Boolean(data.posts.some((item) => item.id === payload.postId)),
      cancelRun: Boolean(actionRun && (platformAdmin || scopedRole.some((role) => ["approver", "operator"].includes(role)))),
    };
    if (requireSignIn && (
      (payload.runId !== undefined && !actionRun) ||
      (!platformAdmin && payload.clientId != null && payload.clientId !== targetClient) ||
      (name === "saveBrief" && !data.projects.some(({ id, clientId }) => id === payload.projectId && clientId === targetClient)) ||
      !(data.liveAccess && Object.hasOwn(livePermissions, name)
        ? livePermissions[name] : canPerformAction(session, targetClient, name, actionRun))
    )) throw new Error("You do not have permission to perform this action.");
    const scopedClient = name === "loadAudit" && platformAdmin && !brandAudit
      ? undefined
      : !requireSignIn || platformAdmin ? payload.clientId ?? targetClient : targetClient;
    const result = await store.dispatch(name, { ...payload, clientId: scopedClient,
      projectId: actionRun?.projectId ?? payload.projectId });
    if (data.liveAccess && ["decideReview", "cancelRun", "requestPlanApproval", "savePostDraft", "regeneratePost"].includes(name)) {
      await store.dispatch("refreshApprovals");
      if (name === "decideReview") {
        const request = assignedReview.contentItemId
          ? ["loadPostDetail", { projectId: payload.projectId, postId: String(assignedReview.contentItemId) }]
          : ["loadRunDetail", { projectId: payload.projectId, runId: String(assignedReview.runId) }];
        try {
          await store.dispatch(...request);
        } catch {
          setDetailError("The decision was saved. Reload to refresh this record.");
        }
      }
    }
    if (name === "signIn" && payload.reauthenticate && result?.redirectUrl)
      sessionStorage.setItem("b2b-review-return", window.location.hash);
    if (result?.redirectUrl) followAuthRedirect(result.redirectUrl);
    if (name === "signOut" && result !== false) navigate("sign-in");
    return result;
  }, [store, client?.id, data, requireSignIn, session, platformAdmin, brandAudit]);

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
  const logout = signedIn && <LogoutButton action={action} />;
  const profileHref = signedIn ? workflowHref("profile") : undefined;
  if (page === "my-brands") {
    return brandsAllowed ? (
      <MyBrands
        clients={clients}
        data={data}
        session={session}
        href={(target, id, parameters) => allowed(target, id) ? workflowHref(target, { client: id, ...parameters }) : undefined}
        peopleHref={platformAdmin ? workflowHref("users") : undefined}
        approvalsHref={approvalsHref}
        logout={logout}
        profileHref={profileHref}
        adminHref={platformAdmin ? workflowHref("overview") : undefined}
      />
    ) : <p role="alert">My brands is unavailable for this account.</p>;
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
        logout={logout}
        profileHref={profileHref}
        selectedClientId={client?.id}
        session={session}
        brandsHref={brandsAllowed ? workflowHref("my-brands") : undefined}
        approvalsHref={approvalsHref}
        onSignOut={signedIn ? () => action("signOut").catch(() => {}) : undefined}
        scopedClients={requireSignIn ? clients : undefined}
        onClientChange={requireSignIn ? onClientChange : undefined}
        canOpen={allowed}
        readOnly={!knowledgeEditor}
        scopedAudit={brandAudit || (requireSignIn && !platformAdmin)}
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
  const showSetup = pageAllowed && !data.liveAccess && view === "new-run" && !params.has("run") &&
    needsFirstRunSetup(client, data.readiness.find((report) => report.clientId === client?.id));
  const liveScreen = data.liveAccess && { approvals: LiveApprovals, plan: LivePlan, post: LivePost }[view];
  const Screen = showSetup ? OperatorHome : liveScreen || (screens[view] ?? OperatorHome);
  const clientHref = (target, parameters) => allowed(target) ? workflowHref(target, { client: client?.id, ...parameters }) : undefined;
  const clientNavigate = (target, parameters) => navigate(target, { client: client?.id, ...parameters });
  return (
    <WorkflowShell
      logout={logout}
      page={showSetup ? "home" : view}
      data={data}
      clients={clients}
      client={client}
      onClientChange={onClientChange}
      href={(target, parameters) => target === "approvals"
        ? clientHref(target, parameters) ?? approvalsHref
        : clientHref(target, parameters)}
      brandsHref={brandsAllowed ? workflowHref("my-brands") : undefined}
      approvalsHref={approvalsHref}
      profileHref={profileHref}
      platformHref={clientHref}
      onSignOut={signedIn ? () => action("signOut").catch(() => {}) : undefined}
    >
      {detailError && <p role="alert">{detailError}</p>}
      {pageAllowed ? <Screen
        key={[view, client?.id, run?.id, post?.id].join(":")}
        data={data}
        client={client}
        showSetup={showSetup}
        run={run}
        post={post}
        action={action}
        href={clientHref}
        navigate={clientNavigate}
        preview={preview}
        readOnly={view === "knowledge" && !knowledgeEditor}
        canAct={(name, targetRun = run) => !requireSignIn ||
          (data.liveAccess && name === "cancelRun"
            ? Boolean(targetRun && (platformAdmin || rolesForClient(session, client?.id).some((role) => ["approver", "operator"].includes(role))))
            : (!data.liveAccess || name === "saveBrief") && canPerformAction(session, client?.id, name, targetRun))}
        link={(file) => ({
          href: clientHref(file === "RecordReview.dc.html" ? "records" : file === "Readiness.dc.html" ? "knowledge" : "setup"),
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
      if (new URLSearchParams(window.location.search).has("accessReauthenticated")) {
        const returnHash = sessionStorage.getItem("b2b-review-return");
        sessionStorage.removeItem("b2b-review-return");
        if (returnHash && /^#(?:plan|post)\?/.test(returnHash)) {
          const url = new URL(window.location.href);
          url.searchParams.delete("accessReauthenticated");
          url.hash = returnHash;
          window.history.replaceState(null, "", url);
        }
      }
      if (data.session?.status === "active") {
        try {
          data.clients = await auth.readClients();
        } catch {
          data.clientsLoadError = "Could not load clients.";
        }
        const knowledge = await Promise.all((data.clients ?? []).filter((brand) => !brand.archived)
          .map(async (brand) => {
            const [result, details] = await Promise.all([
              auth.services.readBrandKnowledge(brand.id, {
              sources: canOpenPage(data.session, brand.id, "setup"),
              records: canOpenPage(data.session, brand.id, "records"),
              }),
              auth.services.readBrand(brand.id).catch(() => null),
            ]);
            if (details) Object.assign(brand, details);
            if (result.version != null) brand.knowledgeVersion = result.version;
            return result;
          }));
        for (const key of ["readiness", "uploads", "records"])
          data[key] = knowledge.flatMap((result) => result[key]);
        data.brandKnowledgeLoadError = knowledge.some((result) => result.failed);
        try {
          data.reviewDecisions = (await auth.services.loadApprovals()).reviewDecisions;
        } catch (error) {
          data.approvalsLoadError = error.message;
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
      if (data.session?.status === "active") {
        const workflow = await Promise.allSettled((data.clients ?? []).filter((brand) => !brand.archived)
          .map((brand) => auth.services.readBrandWorkflow(brand.id)));
        const loaded = workflow.filter((result) => result.status === "fulfilled").map((result) => result.value);
        for (const key of ["projects", "briefs", "runs", "posts"])
          data[key] = loaded.flatMap((result) => result[key]);
        const versions = await Promise.allSettled(data.projects.filter(({ clientId }) =>
          canOpenPage(data.session, clientId, "records")).map(async ({ id, clientId }) => {
          const versions = await auth.services.loadKnowledgeVersions({ projectId: id });
          return versions.map((version) => ({ ...version, clientId, projectId: id }));
        }));
        data.projectKnowledgeVersions = versions.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        data.knowledgeVersionsLoadError = versions.some((result) => result.status === "rejected");
        if (workflow.some((result) => result.status === "rejected"))
          data.workflowLoadError = "Some workflow records could not be loaded. Reload the app to retry.";
      }
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
