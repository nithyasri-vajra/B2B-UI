const sessionStatuses = new Set(["active", "pending", "denied", "expired"]);
const accessDraftKey = "b2b.pending-user-access";
const userStatuses = {
  active: "Active", pending: "Pending role", suspended: "Suspended",
  deactivated: "Deactivated in IdP",
};
const clientRoles = {
  knowledge_admin: "Knowledge Admin", approver: "Approver",
  marketing_operator: "Marketing Operator", viewer: "Viewer",
};
const roleKeys = Object.fromEntries(
  Object.entries(clientRoles).map(([key, label]) => [label, key]),
);

const toAdminUser = (user) => ({
  email: user.email,
  name: user.name,
  status: userStatuses[user.status],
  note: user.accessRequestNote,
  requestedAt: user.accessRequestedAt,
  global: user.globalRoles?.includes("platform_admin"),
  assignments: Object.fromEntries((user.clientAssignments ?? []).map(
    ({ clientId, roles }) => [clientId, roles.map((role) => clientRoles[role])],
  )),
});

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

  async function call(path, payload) {
    const response = await request(endpoint + path, {
      method: payload === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

    if (response.status === 401 && path === "/session")
      return { data: { session: null } };
    if (response.status === 204 && path === "/sign-out")
      return { data: { session: null } };

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const result = isJson ? await response.json() : null;
    if (!response.ok || !result || typeof result !== "object" || Array.isArray(result)) {
      const error = new Error(result?.message || "The authentication service could not complete this request.");
      error.code = result?.code;
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
    return (await call("/clients")).data.clients;
  }

  async function saveAccess(payload) {
    const result = await call("/user-access", payload);
    if (Array.isArray(result.data?.users) && result.data.users.length) {
      return { ...result, data: { users: result.data.users.map(toAdminUser) } };
    }
    try {
      return { ...result, data: { users: await readUsers() } };
    } catch {
      return { ...result, refreshRequired: true, message: "Access saved. Go back to refresh the users list." };
    }
  }

  async function changeAccess(payload) {
    try {
      return await saveAccess(payload);
    } catch (error) {
      if (error.code !== "reauthentication_required") throw error;
      const { redirectUrl } = await call("/sign-in", { reauthenticate: true });
      sessionStorage.setItem(accessDraftKey, JSON.stringify(payload));
      return { redirectUrl };
    }
  }

  async function resumeAccess() {
    const draft = sessionStorage.getItem(accessDraftKey);
    sessionStorage.removeItem(accessDraftKey);
    if (draft) return saveAccess(JSON.parse(draft));
  }

  const services = {
    async loadAudit() {
      const audit = [];
      let offset = 0;
      do {
        const { data } = await call("/audit?offset=" + offset);
        audit.push(...data.audit.map((event) => ({
          id: String(event._id),
          timestamp: event.occurredAt,
          clientId: event.clientId,
          actor: event.actor,
          action: event.eventType,
          object: event.target ?? event.outcome,
          before: event.details?.before && JSON.stringify(event.details.before),
          after: event.details?.after && JSON.stringify(event.details.after),
          ip: event.ip,
          device: event.device,
        })));
        offset = data.nextOffset ?? null;
      } while (offset !== null);
      return { data: { audit } };
    },
    async loadClients() {
      return { data: { clients: await readClients() } };
    },
    async createClient({ values }) {
      return call("/clients", values);
    },
    async loadUsers() {
      return { data: { users: await readUsers() } };
    },
    async saveUserAccess({ after, reason, confirmed }) {
      return changeAccess({
        email: after.email,
        clientAssignments: Object.entries(after.assignments)
          .filter(([, roles]) => roles.length)
          .map(([clientId, roles]) => ({ clientId, roles: roles.map((role) => roleKeys[role]) })),
        globalRoles: after.global ? ["platform_admin"] : [],
        reason: reason.trim(),
        confirmPlatformAdmin: confirmed === true,
      });
    },
    async declineAccessRequest({ email, reason }) {
      return changeAccess({ action: "decline", email, reason });
    },
    async signIn({ chooseAccount = false } = {}) {
      const result = await call("/sign-in", { chooseAccount });
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
      sessionStorage.removeItem(accessDraftKey);
      return { data: { session: null } };
    },
  };

  return { readSession, readClients, resumeAccess, services };
}
