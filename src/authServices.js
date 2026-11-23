const sessionStatuses = new Set(["active", "pending", "denied", "expired"]);

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
    if (!response.ok || !result || typeof result !== "object" || Array.isArray(result))
      throw new Error("The authentication service could not complete this request.");

    return result;
  }

  async function readSession() {
    const result = await call("/session");
    const session = result.data?.session;
    if (session !== null && !sessionStatuses.has(session?.status))
      throw new Error("The authentication service returned an invalid session.");
    return result.data;
  }

  const services = {
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
      return { data: { session: null } };
    },
  };

  return { readSession, services };
}
