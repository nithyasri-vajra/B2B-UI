import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import AdminApp, { adminPages } from "./AdminApp";
import { createAdminStore } from "./adminData";
import { ContentCalendar, OperatorHome, WorkflowShell } from "./OperatorHome";
import SignIn from "./SignIn";
import NewRun from "./NewRun";
import RunWorkspace from "./RunWorkspace";
import PlanReview from "./PlanReview";
import PostReview from "./PostReview";
import ApprovalsQueue from "./ApprovalsQueue";

const screens = {
  home: OperatorHome,
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

export function B2BAgents({
  store,
  requireSignIn = true,
  defaultPage = "home",
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
  const client = clients.find((item) => item.id === selection) ?? clients[0];
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
      navigate(platformAdmin ? "overview" : "home");
  }, [signedIn, page, platformAdmin]);

  async function action(name, payload) {
    const result = await store.dispatch(name, {
      clientId: client?.id,
      ...payload,
    });
    if (name === "signIn" && result?.redirectUrl) {
      const target = new URL(result.redirectUrl, window.location.origin);
      if (
        target.protocol !== "https:" &&
        target.origin !== window.location.origin
      )
        throw new Error("Invalid sign-in redirect.");
      window.location.assign(target.href);
    }
    if (name === "signOut" && result !== false) navigate("sign-in");
    return result;
  }

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
        store={store}
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
  const onClientChange = (id) => {
    setSelection(id);
    if (run || post)
      navigate(view === "plan" || view === "post" ? "approvals" : view);
  };
  return (
    <WorkflowShell
      page={view}
      data={data}
      clients={clients}
      client={client}
      onClientChange={onClientChange}
      href={workflowHref}
    >
      <Screen
        key={[view, client?.id, run?.id, post?.id].join(":")}
        data={data}
        client={client}
        run={run}
        post={post}
        action={action}
        href={workflowHref}
        navigate={navigate}
      />
    </WorkflowShell>
  );
}

const mount = document.getElementById("root");
if (mount)
  createRoot(mount).render(
    <B2BAgents
      store={createAdminStore()}
      requireSignIn={false}
      defaultPage="overview"
    />,
  );
