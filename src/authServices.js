const sessionStatuses = new Set(["active", "pending", "denied", "expired"]);
export const knowledgeFileTypes = [
  ".md", ".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".vtt", ".png", ".jpg", ".jpeg", ".webp", ".gif",
];
const userStatuses = {
  active: "Active", pending: "Pending role", suspended: "Suspended",
  deactivated: "Deactivated in IdP",
};
const clientRoles = {
  brand_manager: "Brand Manager", approver: "Approver",
  operator: "Operator", viewer: "Viewer",
};
const roleKeys = Object.fromEntries(
  Object.entries(clientRoles).map(([key, label]) => [label, key]),
);

const toAdminUser = (user) => ({
  id: user.id ?? user._id,
  email: user.email,
  name: user.name,
  status: userStatuses[user.status],
  note: user.accessRequestNote,
  requestedAt: user.accessRequestedAt,
  global: user.globalRoles?.includes("platform_admin"),
  assignments: Object.fromEntries((user.clientAssignments ?? []).map(
    ({ clientId, roles }) => [String(clientId), roles.map((role) => clientRoles[role] ?? role)],
  )),
});

function toBrand(brand) {
  const id = brand.id ?? brand._id;
  if (id == null) throw new Error("The brand response did not include an ID.");
  const channelNames = brand.channels?.map((channel) =>
    typeof channel === "string" ? channel : channel.name ?? channel.type,
  ).filter(Boolean);
  return {
    ...brand, id: String(id),
    archived: brand.archived === true || String(brand.status).toLowerCase() === "archived",
    channel: channelNames?.length ? channelNames.join(", ") : brand.channel,
    language: brand.spelling ?? brand.language,
  };
}

const pathId = (value) => encodeURIComponent(String(value));
const brandPath = (id) => "/workflow/brands/" + pathId(id);
const projectPath = (id) => "/workflow/projects/" + pathId(id);
const label = (value) => typeof value === "string"
  ? value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : undefined;
const scoped = (row, clientId) => ({ ...row, id: String(row.id ?? row._id), clientId });
const sourceRow = (row, clientId) => ({
  ...scoped(row, clientId), name: row.title ?? row.name, status: label(row.processingStatus),
  domain: row.areas?.join(", "),
});
const knowledgeRow = (row, clientId) => {
  const revision = row.revisions.find((entry) => entry.revision === row.currentRevision);
  return { ...scoped(row, clientId), domain: row.area, item: revision?.statement,
    title: revision?.statement, quote: revision?.statement, state: label(revision?.reviewStatus),
    grade: revision?.evidenceGrade, reuse: label(revision?.usagePermission),
    source: revision?.sourceReference, reviewBy: revision?.reviewDueAt,
    type: row.recordType, version: row.currentRevision };
};

export function createAuthServices(basePath, { origin, request = fetch } = {}) {
  const appOrigin = origin ?? window.location.origin;
  const base = new URL(basePath, appOrigin);
  if (
    base.origin !== appOrigin ||
    base.pathname.startsWith("//") ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error("The authentication API must use a same-origin path.");

  const endpoint = base.pathname.replace(/\/$/, "");

  async function call(path, payload, method = payload === undefined ? "GET" : "POST") {
    const multipart = payload instanceof FormData;
    const response = await request(endpoint + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(payload === undefined || multipart ? {} : { "Content-Type": "application/json" }),
      },
      body: multipart || payload === undefined ? payload : JSON.stringify(payload),
    });

    if (response.status === 401 && path === "/session")
      return { data: { session: null } };
    if (response.status === 204 && path === "/sign-out")
      return { data: { session: null } };

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const result = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok || !result || typeof result !== "object" || Array.isArray(result)) {
      const workflow = path.startsWith("/workflow/") || /^\/(clients|run-context)(?:[/?]|$)/.test(path);
      const guidance = typeof result?.retryGuidance === "string" ? result.retryGuidance : "";
      const requestId = result?.requestId ?? response.headers.get("X-Request-Id");
      const supplied = result?.message ?? result?.detail;
      const fallback = ({
        401: "Sign in again to continue.",
        403: "You do not have permission to perform this action.",
        404: "This record or endpoint is unavailable.",
        409: "This record changed. Reload it before saving again.",
        400: "Check the required fields and try again.",
        422: "The supplied values do not meet the requirements for this action.",
      })[response.status] || (workflow && response.status >= 500
        ? method === "GET" ? "Could not load workflow information. Try again shortly." :
          "Could not complete the workflow action. Refresh and check whether the change was saved before retrying."
        : "The service could not complete this request.");
      const message = typeof supplied === "string" && supplied &&
        !(workflow && supplied === "Could not complete the authentication request.") ? supplied : fallback;
      const error = new Error([
        message, guidance && !message.endsWith(guidance) ? guidance : "",
        workflow && requestId ? "Reference: " + requestId : "",
      ].filter(Boolean).join(" "));
      error.code = result?.code;
      error.status = response.status;
      error.retryable = result?.retryable;
      error.requestId = requestId;
      throw error;
    }

    return result;
  }

  async function readSession() {
    const result = await call("/session");
    const session = result.data?.session;
    if (session !== null && !sessionStatuses.has(session?.status))
      throw new Error("The authentication service returned an invalid session.");
    return result.data;
  }

  async function readUsers() {
    const users = [];
    let offset = 0;
    do {
      const { data } = await call("/users?offset=" + offset);
      users.push(...data.users);
      offset = data.nextOffset ?? null;
    } while (offset !== null);
    return users.map(toAdminUser);
  }

  async function readClients() {
    const { data } = await call("/clients");
    return (data.clients ?? data.brands).map(toBrand);
  }

  async function saveAccess(payload) {
    const result = await call("/user-access", payload);
    return { message: result.message, data: { users: result.data.users.map(toAdminUser) } };
  }

  async function readBrandWorkflow(clientId) {
    const { projects } = await call("/workflow/clients/" + pathId(clientId) + "/projects");
    const batches = await Promise.all(projects.map(async (project) => {
      const projectId = String(project.id ?? project._id);
      const base = "/workflow/projects/" + pathId(projectId);
      const [briefs, runs, posts] = await Promise.all(["briefs", "runs", "posts"].map((name) => call(base + "/" + name)));
      const scoped = (record) => ({ ...record, id: String(record.id ?? record._id), clientId, projectId });
      return {
        projects: [{ ...project, id: projectId, clientId }],
        briefs: briefs.briefs.map(scoped),
        runs: runs.runs.map((record) => ({ ...scoped(record), briefId: record.briefId == null ? undefined : String(record.briefId) })),
        posts: posts.contentItems.map((record) => ({ ...scoped(record), runId: record.runId == null ? undefined : String(record.runId) })),
      };
    }));
    return Object.fromEntries(["projects", "briefs", "runs", "posts"].map((key) => [key, batches.flatMap((batch) => batch[key])]));
  }

  const services = {
    async loadAudit({ clientId, offset }) {
      const query = new URLSearchParams({ offset });
      if (clientId) query.set("clientId", clientId);
      const { data } = await call("/audit?" + query);
      return {
        audit: data.audit.map((event) => ({
          ...event,
          clientId: event.clientId == null ? undefined : String(event.clientId),
          timestamp: event.occurredAt,
          action: event.eventType,
          object: event.target,
          before: event.details?.before == null ? undefined : JSON.stringify(event.details.before),
          after: event.details?.after == null ? undefined : JSON.stringify(event.details.after),
        })),
        nextOffset: data.nextOffset,
      };
    },
    async loadClients() {
      return { data: { clients: await readClients() } };
    },
    async createClient({ values }) {
      const { name, website, timezone, brandManagerUserId, industry, language } = values;
      const { data, message } = await call("/clients", { name, website, timezone, brandManagerUserId, industry, spelling: language });
      return { message, data: { clients: (data.clients ?? data.brands).map(toBrand) } };
    },
    readBrandWorkflow,
    async readBrand(clientId) {
      const { brand } = await call(brandPath(clientId));
      return toBrand(brand);
    },
    async saveClientSettings({ clientId, values, tab }) {
      const keys = tab === "Governance"
        ? ["defaultApproverUserId", "backupApproverUserId"] : ["name", "website", "timezone", "industry", "spelling"];
      const update = Object.fromEntries(keys.filter((key) => (values[key] ?? (key === "spelling" ? values.language : undefined)) != null)
        .map((key) => [key, key === "spelling" ? values.language : values[key]]));
      const { brand } = await call(brandPath(clientId), update, "PATCH");
      return { data: { clients: [toBrand(brand)] } };
    },
    async archiveClient({ clientId }) {
      const { brand } = await call(brandPath(clientId), { status: "archived" }, "PATCH");
      return { data: { clients: [toBrand(brand)] } };
    },
    async readBrandKnowledge(clientId, { sources, records }) {
      const base = brandPath(clientId) + "/knowledge";
      const [report, uploads, entries] = await Promise.allSettled([
        call(base + "/readiness"), sources && call(base + "/sources"), records && call(base + "/records"),
      ]);
      return {
        readiness: report.value?.readiness ? [{ ...report.value.readiness, clientId }] : [],
        version: report.value?.version,
        uploads: (uploads.value?.knowledgeSources ?? []).map((row) => sourceRow(row, clientId)),
        records: (entries.value?.knowledgeRecords ?? []).map((row) => knowledgeRow(row, clientId)),
        failed: [report, uploads, entries].some(({ status }) => status === "rejected"),
      };
    },
    async addKnowledgeSource({ clientId, title, url, areas, file }) {
      if (file !== undefined) {
        if (!(file instanceof File) || !file.size) throw new Error("Choose one non-empty knowledge file.");
        if (file.size > 2 * 1024 * 1024) throw new Error("Choose a knowledge file no larger than 2 MiB.");
        const name = file.name.trim();
        if (!knowledgeFileTypes.includes(name.slice(name.lastIndexOf(".")).toLowerCase()) ||
            name.lastIndexOf(".") < 1 || name.length > 255)
          throw new Error("Choose a supported knowledge file.");
        if (!areas.length || areas.length > 20 || areas.some((area) => area.length > 100))
          throw new Error("Enter 1 to 20 knowledge areas, up to 100 characters each.");
        const form = new FormData();
        form.append("file", file);
        for (const area of areas) form.append("areas", area);
        const { source, record } = await call(brandPath(clientId) + "/knowledge/sources/upload", form);
        const upload = sourceRow(source, clientId);
        return { message: "File uploaded. Processing status: " + (upload.status ?? "Unknown") + ".",
          data: { uploads: [upload], ...(record ? { records: [knowledgeRow(record, clientId)] } : {}) } };
      }
      const { source } = await call(brandPath(clientId) + "/knowledge/sources", { title, url, areas, sourceType: "link" });
      return { message: "Source registered. Processing is pending.", data: { uploads: [sourceRow(source, clientId)] } };
    },
    async createKnowledgeRecord({ clientId, sourceId, area, recordType, statement }) {
      const { record } = await call(brandPath(clientId) + "/knowledge/records", { sourceId, area, recordType, statement });
      return { data: { records: [knowledgeRow(record, clientId)] } };
    },
    async reviseKnowledgeRecord({ clientId, id, currentRevision, reviewStatus, statement, evidenceGrade }) {
      const { record } = await call(brandPath(clientId) + "/knowledge/records/" + pathId(id) + "/revisions",
        { currentRevision, reviewStatus, statement, evidenceGrade });
      return { data: { records: [knowledgeRow(record, clientId)] } };
    },
    async publishKnowledge({ clientId }) {
      const { knowledgeVersion } = await call(brandPath(clientId) + "/knowledge/versions", {});
      return { message: "Knowledge version published.", data: { clients: [{ id: clientId, knowledgeVersion: knowledgeVersion.version }] } };
    },
    async loadApprovals() {
      const { reviewDecisions } = await call("/workflow/approvals");
      return { reviewDecisions };
    },
    async refreshApprovals() {
      try {
        return { data: { ...await services.loadApprovals(), approvalsLoadError: undefined } };
      } catch {
        return { data: { reviewDecisions: [], approvalsLoadError: "Could not refresh reviews. Reload to retry." } };
      }
    },
    async cancelRun({ projectId, runId }) {
      const { run } = await call(projectPath(projectId) + "/runs/" + pathId(runId) + "/cancel", {});
      return { data: { runs: [{ ...scoped(run, String(run.clientId)), projectId, status: label(run.status) }] } };
    },
    async requestPlanApproval({ projectId, runId, planVersion, selectedPlanItemIds, askApprover }) {
      await call(projectPath(projectId) + "/runs/" + pathId(runId) + "/plan-review",
        { planVersion, selectedPlanItemIds, askApprover });
      return services.loadRunDetail({ projectId, runId });
    },
    async decideReview({ projectId, reviewId, decision, reason, scheduledAt }) {
      await call(projectPath(projectId) + "/reviews/" + pathId(reviewId) + "/decision",
        { decision, reason, ...(scheduledAt ? { scheduledAt } : {}) });
      return { message: "Decision saved." };
    },
    async savePostDraft({ projectId, postId, currentDraftVersionId, text }) {
      await call(projectPath(projectId) + "/posts/" + pathId(postId) + "/drafts", { currentDraftVersionId, text });
      return services.loadPostDetail({ projectId, postId });
    },
    // Reviewer feedback in plain language: the backend regenerates the post in the background.
    async regeneratePost({ projectId, postId, currentDraftVersionId, feedback }) {
      await call(projectPath(projectId) + "/posts/" + pathId(postId) + "/regenerate", { currentDraftVersionId, feedback });
      const detail = await services.loadPostDetail({ projectId, postId });
      return { ...detail, message: "Regenerating the post with your feedback. This usually takes a few minutes." };
    },
    async loadKnowledgeVersions({ projectId }) {
      const { knowledgeVersions } = await call("/workflow/projects/" + pathId(projectId) + "/knowledge");
      return knowledgeVersions;
    },
    async loadRunDetail({ projectId, runId }) {
      const { record, stageExecutions, reviewDecisions } = await call("/workflow/projects/" + pathId(projectId) + "/runs/" + pathId(runId));
      return { data: { runs: [{ ...record, id: runId, clientId: String(record.clientId), projectId,
        briefId: record.briefId == null ? undefined : String(record.briefId), stageExecutions, reviewDecisions }] } };
    },
    async loadPostDetail({ projectId, postId }) {
      const { record, draftVersions, reviewDecisions } = await call("/workflow/projects/" + pathId(projectId) + "/posts/" + pathId(postId));
      const current = draftVersions.find((draft) => String(draft.id ?? draft._id) === String(record.currentDraftVersionId));
      return { data: { posts: [{ ...record, id: postId, clientId: String(record.clientId), projectId,
        runId: String(record.runId), draftVersions, reviewDecisions, copy: current?.text ?? record.copy,
        version: current?.version ?? record.version }] } };
    },
    async saveBrief({ projectId, values }) {
      const { brief } = await call("/workflow/projects/" + pathId(projectId) + "/briefs", values);
      return { data: { briefs: [{ ...brief, id: String(brief.id ?? brief._id), clientId: String(brief.clientId), projectId }] } };
    },
    async startRun({ clientId, projectId, briefId, briefVersion, agentKey, progressId }) {
      if (progressId) return services.loadRunDetail({ projectId, runId: progressId });
      const { run } = await call(projectPath(projectId) + "/runs", { clientId, briefId, briefVersion, agentKey });
      const id = String(run._id);
      return { runId: id, data: { runs: [{ ...run, id, clientId, projectId }] } };
    },
    async loadUsers() {
      return { data: { users: await readUsers() } };
    },
    async saveUserAccess({ after, reason, confirmed }) {
      return saveAccess({
        email: after.email,
        clientAssignments: Object.entries(after.assignments)
          .filter(([, roles]) => roles.length)
          .map(([clientId, roles]) => ({ clientId, roles: roles.map((role) => roleKeys[role]) })),
        globalRoles: after.global ? ["platform_admin"] : [],
        reason: reason?.trim() ?? "",
        confirmPlatformAdmin: confirmed === true,
      });
    },
    async preAddUser({ email }) {
      return saveAccess({ action: "pre_add", email });
    },
    async suspendUser({ email, confirmed }) {
      return saveAccess({
        action: "suspend", email, confirmPlatformAdmin: confirmed === true,
        reason: confirmed ? "Suspended from Users and Roles." : "",
      });
    },
    async removeUserFromClient({ email, client }) {
      return saveAccess({ action: "remove_client", email, clientId: client });
    },
    async declineAccessRequest({ email, reason }) {
      return saveAccess({ action: "decline", email, reason });
    },
    async signIn({ chooseAccount = false, reauthenticate = false } = {}) {
      const result = await call("/sign-in", { chooseAccount, reauthenticate });
      if (typeof result.redirectUrl !== "string" || !result.redirectUrl.trim())
        throw new Error("The authentication service returned no sign-in link.");
      return { redirectUrl: result.redirectUrl };
    },

    async requestAccess({ note }) {
      const result = await call("/request-access", { note });
      return { message: result.message || "Your note was sent to the Platform Admin." };
    },

    async signOut() {
      await call("/sign-out", {});
      return { data: { session: null } };
    },
  };

  return { readSession, readClients, services };
}
