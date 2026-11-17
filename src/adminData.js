const collections = [
  "clients",
  "users",
  "runs",
  "briefs",
  "tasks",
  "plans",
  "posts",
  "approvals",
  "uploads",
  "records",
  "proposals",
  "readiness",
  "agents",
  "audit",
  "notifications",
];

function emptyData() {
  return {
    ...Object.fromEntries(collections.map((key) => [key, []])),
    integrations: {},
    session: null,
  };
}

const identity = (key, item) =>
  key === "users" ? item.email : key === "readiness" ? item.clientId : item.id;

function mergeRows(key, previous, incoming) {
  const rows = new Map(previous.map((item) => [identity(key, item), item]));
  for (const item of incoming) {
    const id = identity(key, item);
    if (!id) throw new Error(key + " requires a stable identifier.");
    if (
      [
        "runs",
        "uploads",
        "records",
        "proposals",
        "briefs",
        "tasks",
        "plans",
        "posts",
        "approvals",
      ].includes(key) &&
      !item.clientId &&
      !rows.get(id)?.clientId
    )
      throw new Error(key + " requires a clientId.");
    rows.set(id, { ...rows.get(id), ...item });
  }
  return [...rows.values()];
}

export function createAdminStore(initial = {}, services = {}) {
  let data = { ...emptyData(), ...initial };
  const listeners = new Set();
  const publish = (next) => {
    data = next;
    listeners.forEach((listener) => listener());
  };
  function ingest(patch) {
    const next = { ...data };
    for (const key of collections) {
      if (patch[key]) next[key] = mergeRows(key, data[key], patch[key]);
    }
    if (patch.integrations)
      next.integrations = { ...data.integrations, ...patch.integrations };
    if ("session" in patch) next.session = patch.session;
    publish(next);
  }

  const external = new Set([
    "signIn",
    "signOut",
    "requestAccess",
    "validateBrief",
    "startRun",
    "saveRunDraft",
    "replaceBrief",
    "cancelRun",
    "askKnowledgeAdmin",
    "rewriteWithoutClaim",
    "answerRunQuestion",
    "editPlanItem",
    "approvePlan",
    "rejectPlan",
    "commentOnPost",
    "requestProfileConnection",
    "approvePost",
    "approvePosts",
    "holdPost",
    "rejectPost",
    "requestPostChanges",
    "uploadSources",
    "runMarketResearch",
    "draftClientQuestions",
    "recalculateReadiness",
    "publishKnowledge",
    "reconnectClientLinkedIn",
    "testLinkedInConnection",
    "revokeLinkedInTestProfile",
    "saveUserAccess",
    "removeUserFromClient",
    "enableAgentVersion",
    "saveAgentLimits",
    "askClient",
    "reviewKnowledgeChange",
    "markGapNotApplicable",
  ]);

  async function dispatch(name, payload = {}) {
    if (services[name]) {
      const result = await services[name](payload);
      if (result?.data) ingest(result.data);
      return result;
    }
    if (external.has(name))
      throw new Error(
        "Connect this action to the app service before using it.",
      );
    const client = data.clients.find((item) => item.id === payload.clientId);
    const user = data.users.find((item) => item.email === payload.email);
    const record = data.records.find(
      (item) => item.id === payload.id && item.clientId === payload.clientId,
    );
    const time = new Date().toISOString();
    let change;
    switch (name) {
      case "createClient": {
        const values = payload.values;
        if (!values?.name?.trim()) throw new Error("Enter a client name.");
        const label = values.name.trim();
        if (
          data.clients.some(
            (item) =>
              !item.archived && item.name.toLowerCase() === label.toLowerCase(),
          )
        )
          throw new Error("A client with this name already exists.");
        change = {
          clients: [{ ...values, id: crypto.randomUUID(), name: label }],
        };
        break;
      }
      case "saveClientSettings":
      case "archiveClient":
        if (!client) throw new Error("Select a client.");
        change = {
          clients: [
            {
              ...client,
              ...(name === "archiveClient"
                ? { archived: true }
                : payload.values),
              id: client.id,
            },
          ],
        };
        break;
      case "preAddUser":
        if (user) throw new Error("This email already exists.");
        change = {
          users: [
            {
              email: payload.email,
              name: payload.email,
              status: "Pending role",
              assignments: {},
            },
          ],
        };
        break;
      case "suspendUser":
      case "declineAccessRequest":
        if (!user) throw new Error("User not found.");
        change = {
          users: [
            {
              ...user,
              status: name === "suspendUser" ? "Suspended" : "Declined",
            },
          ],
        };
        break;
      case "editKnowledgeRecord":
      case "approveKnowledgeRecord":
      case "rejectKnowledgeRecord":
      case "disputeKnowledgeRecord":
      case "supersedeKnowledgeRecord":
        if (!record) throw new Error("Record not found for this client.");
        if (
          name === "approveKnowledgeRecord" &&
          (record.state === "Disputed" ||
            (record.grade === "D" && record.reuse === "Public"))
        ) {
          throw new Error(
            "Resolve the conflict or public-use evidence issue before approval.",
          );
        }
        change = {
          records: [
            {
              ...record,
              ...payload,
              ...(name === "approveKnowledgeRecord" ? { approved: time } : {}),
            },
          ],
        };
        break;
      case "resolveKnowledgeConflict": {
        const disputed = data.records.filter(
          (item) =>
            item.clientId === payload.clientId &&
            payload.records.includes(item.id) &&
            item.state === "Disputed",
        );
        if (disputed.length !== 2)
          throw new Error("Both disputed records must still be open.");
        const keep =
          payload.decision === "Keep both with scope"
            ? payload.records
            : [payload.records[payload.decision === "Keep A" ? 0 : 1]];
        change = {
          records: disputed.map((item) => {
            if (payload.decision === "Escalate")
              return { ...item, escalated: true };
            return {
              ...item,
              scope: payload.scope || item.scope,
              state: keep.includes(item.id) ? "Captured" : "Superseded",
              review: keep.includes(item.id),
            };
          }),
        };
        break;
      }
      case "saveKnowledgeSetup":
        if (!client) throw new Error("Select a client.");
        change = { clients: [{ ...client, setupSavedAt: time }] };
        break;
      default:
        throw new Error("Action is not connected.");
    }
    const [collection, rows] = Object.entries(change)[0];
    const after = rows
      .map((item) => item.name || item.email || item.id)
      .join(", ");
    ingest({
      ...change,
      audit: [
        {
          id: crypto.randomUUID(),
          timestamp: time,
          actor: data.session?.name ?? "—",
          clientId: payload.clientId ?? change.clients?.[0]?.id,
          action: name,
          object: after,
          before: record?.state ?? user?.status ?? client?.name,
          after: rows[0].state ?? rows[0].status ?? rows[0].name,
        },
      ],
    });
    return { message: "Saved." };
  }
  return {
    ingest,
    dispatch,
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
