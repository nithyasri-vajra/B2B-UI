import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import AdminApp, { adminPages } from "./AdminApp";
import { createAdminStore } from "./adminData";
import KnowledgeReadiness from "./KnowledgeReadiness";
import { createKnowledgeFileRecord, previewKnowledgeReadiness } from "./extractKnowledgeRecords";
import { restorePreviewStore } from "./previewStorage";
import { ContentCalendar, OperatorHome, WorkflowShell } from "./OperatorHome";
import SignIn from "./SignIn";
import NewRun from "./NewRun";
import { validateBrief } from "./validateBrief";
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
if (mount) {
  function getRunInput(clientId, briefId, openFeedback) {
    const data = previewStore.getSnapshot();
    const client = data.clients.find(({ id }) => id === clientId);
    const brief = data.briefs.find((item) => item.id === briefId && item.clientId === clientId);
    if (!brief?.validated || brief.issues?.some(({ severity }) => severity === "Error"))
        throw new Error("Validate the Excel brief before starting.");
    if (!client?.knowledge || !data.readiness.some((report) => report.clientId === clientId && report.canStart))
        throw new Error("Publish the approved knowledge before starting.");
    const knowledge = data.records
      .filter((record) => record.clientId === clientId && record.state === "Approved" && !record.review)
      .map(({ id, item, quote, reuse, approved }) => ({ id, source: item, content: quote, reuse, approved }));
    return {
      client: client.name.replace(/ \(Preview\)$/, ""),
      project: "Social Media Agent",
      channel: client.channel || Object.entries(brief.fields).find(
        ([name]) => name.trim().toLowerCase() === "channel",
      )?.[1],
      knowledgeVersion: client.knowledge,
      knowledge,
      ...(openFeedback && { openFeedback: { status: openFeedback, period: brief.period, source: "User-provided run input" } }),
      brief: { fields: brief.fields, period: brief.period, postCount: brief.postCount },
    };
  }

  async function requestRunStage(path, input) {
    let response;
    let result;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      result = await response.json();
    } catch (error) {
      console.error("Workflow request failed:", path, error);
      throw new Error("Could not connect to the workflow service. Please try again.");
    }
    if (!response.ok) throw new Error(result.message ?? "The run stage could not start.");
    return result;
  }

  async function draftApprovedPlan(run) {
    previewStore.ingest({ runs: [{ ...run, draftingResult: { running: true } }] });
    try {
      const input = getRunInput(run.clientId, run.briefId, run.openFeedback);
      if (run.knowledgeVersion && run.knowledgeVersion !== input.knowledgeVersion)
        throw new Error("The published knowledge changed. Create and approve a new plan before drafting.");
      const result = await requestRunStage("/__preview/draft-plan", {
        ...input,
        plan: run.planningResult.planner,
        approval: run.gate1,
      });
      return { data: { runs: [{ ...run, draftingResult: result }] } };
    } catch (error) {
      return { data: { runs: [{ ...run, draftingResult: { error: error.message } }] } };
    }
  }

  const previewStore = createAdminStore({
    clients: [{ id: "vajra-preview", name: "Vajra Global (Preview)", channel: "LinkedIn" }],
  }, {
    decidePreviewPlan({ clientId, runId, report, decision, reason }) {
      const run = previewStore.getSnapshot().runs.find((item) => item.id === runId && item.clientId === clientId);
      if (run?.status !== "Awaiting Gate 1" || run.planningResult?.planner?.report !== report)
        throw new Error("This plan is no longer pending or has changed. Review the current plan.");
      if (!["Approved", "Rejected"].includes(decision) || (decision === "Rejected" && !reason?.trim()))
        throw new Error("Choose a valid decision and enter a reason when rejecting.");
      const gate1 = { decision, reason: reason?.trim(), decidedAt: new Date().toISOString() };
      if (decision === "Approved") return draftApprovedPlan({ ...run, gate1 });
      return { message: "Gate 1 decision recorded.", data: { runs: [{ ...run, gate1 }] } };
    },
    retryPreviewDraft({ clientId, runId }) {
      const run = previewStore.getSnapshot().runs.find((item) => item.id === runId && item.clientId === clientId);
      if (run?.gate1?.decision !== "Approved" || run.draftingResult?.running ||
          (run.draftingResult && !run.draftingResult.error))
        throw new Error("This run is not eligible to start or retry drafting.");
      return draftApprovedPlan(run);
    },
    publishKnowledge({ clientId }) {
      const client = previewStore.getSnapshot().clients.find(({ id }) => id === clientId);
      const readiness = previewStore.getSnapshot().readiness.find((report) => report.clientId === clientId);
      if (!client || !readiness?.canPublish) throw new Error("Upload and approve all five files before publishing.");
      const version = (client.knowledgeVersion ?? 0) + 1;
      return { data: {
        clients: [{ id: clientId, knowledgeVersion: version, knowledge: "Preview knowledge v" + version }],
        readiness: [{ ...readiness, canStart: true }],
      } };
    },
    async validateBrief({ clientId, file }) {
      const client = previewStore.getSnapshot().clients.find(({ id }) => id === clientId);
      if (!client) throw new Error("Select a client.");
      const result = await validateBrief(file, client);
      const brief = { ...result, id: crypto.randomUUID(), clientId, name: file.name };
      return { data: { briefs: [brief] } };
    },
    async planContent({ clientId, runId }) {
      const run = previewStore.getSnapshot().runs.find((item) => item.id === runId && item.clientId === clientId);
      const qualification = run?.qualificationResult?.qualification;
      if (!run || !["READY", "LIMITED"].includes(qualification?.verdict))
        throw new Error("Complete Brief Qualifier before starting Content Planner.");
      if (run.planningResult?.planner && run.planningResult.planner.verdict !== "BLOCKED")
        throw new Error("This run already has a plan.");
      const input = getRunInput(clientId, run.briefId, run.openFeedback);
      if (run.knowledgeVersion && run.knowledgeVersion !== input.knowledgeVersion)
        throw new Error("The published knowledge version has changed. Qualify the brief again before planning.");
      const result = await requestRunStage("/__preview/plan-content", { ...input, qualification });
      const status = result.error ? "Planning failed"
        : (result.planner?.verdict ?? result.context.verdict) === "BLOCKED" ? "Planning blocked"
        : "Awaiting Gate 1";
      return { data: { runs: [{ ...run, status, planningResult: result, planGeneratedAt: new Date().toISOString() }] } };
    },
    async startRun({ clientId, briefId, openFeedback, agentId }) {
      const input = getRunInput(clientId, briefId, openFeedback);
      const startedAt = new Date().toISOString();
      const result = await requestRunStage("/__preview/start-run", input);
      const verdict = result.qualification?.verdict ?? result.context.verdict;
      const run = {
        id: crypto.randomUUID(),
        clientId,
        briefId,
        ...(agentId && { agentId }),
        period: input.brief.period,
        knowledgeVersion: input.knowledgeVersion,
        startedAt,
        status: result.error ? "Failed" : verdict === "BLOCKED" ? "Waiting for input" : "Qualified",
        openFeedback,
        qualificationResult: result,
      };
      return { data: { runs: [run] } };
    },
    async uploadSources({ clientId, domain, files }) {
      const uploads = [];
      const records = [];
      for (const file of files) {
        const name = file.name.toLowerCase();
        const id = JSON.stringify([clientId, domain, name]);
        const record = await createKnowledgeFileRecord(file, clientId);
        uploads.push({ id, clientId, domain, name: file.name, file, status: "Uploaded", progress: 100, recordCount: record ? 1 : 0 });
        if (record) records.push(record);
      }
      const existing = new Map(previewStore.getSnapshot().records.map((record) => [record.id, record]));
      const changed = records.filter((record) => existing.get(record.id)?.quote !== record.quote);
      return { data: {
        uploads,
        records: changed,
        ...(changed.length && { readiness: [{ clientId, preview: true, canPublish: false, canStart: false }] }),
      } };
    },
  }, (data) => {
    const planApprovals = [];
    const runs = data.runs.map((run) => {
      const planner = run.planningResult?.planner;
      if (!["READY", "LIMITED"].includes(planner?.verdict) || !planner.report?.trim() || run.planningResult.error)
        return run;
      planApprovals.push({
        id: "preview-gate1:" + run.id,
        clientId: run.clientId,
        runId: run.id,
        gate: 1,
        title: "Content plan",
        status: run.gate1?.decision ?? "Pending",
        waitingSince: run.planGeneratedAt ?? run.startedAt,
        decidedAt: run.gate1?.decidedAt,
      });
      return {
        ...run,
        status: run.gate1 ? "Plan " + run.gate1.decision.toLowerCase() : "Awaiting Gate 1",
      };
    });
    return {
      ...data,
      runs,
      approvals: [...data.approvals.filter((item) => !item.id.startsWith("preview-gate1:")), ...planApprovals],
      readiness: data.clients.map(({ id }) => previewKnowledgeReadiness(data, id)),
    };
  });
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
