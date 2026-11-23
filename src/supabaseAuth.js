const verifierKey = "b2b-google-pkce";
const sessionKey = "b2b-supabase-session";

export function createSupabaseAuth(url, key, {
  browser = window,
  request = fetch,
  cryptoApi = crypto,
} = {}) {
  const project = new URL(url);
  const storage = browser.sessionStorage;

  async function post(path, body, token) {
    const response = await request(new URL(path, project), {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error("The sign-in service could not complete this request.");
      error.status = response.status;
      throw error;
    }
    return path.startsWith("/auth/v1/logout") ? null : response.json();
  }

  function saveSession(result) {
    const { access_token, refresh_token, expires_in } = result;
    const session = { access_token, refresh_token, expiresAt: Date.now() + expires_in * 1000 };
    storage.setItem(sessionKey, JSON.stringify(session));
    return session;
  }

  async function currentSession() {
    const session = JSON.parse(storage.getItem(sessionKey));
    if (!session || session.expiresAt > Date.now() + 30_000) return session;

    try {
      return saveSession(await post("/auth/v1/token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      }));
    } catch (error) {
      if (![400, 401, 403].includes(error.status)) throw error;
      storage.removeItem(sessionKey);
      return { expired: true };
    }
  }

  async function readSession() {
    const callback = new URL(browser.location.href);
    const hasCallback = storage.getItem(verifierKey) &&
      (callback.searchParams.has("code") || callback.searchParams.has("error"));

    if (hasCallback) {
      const verifier = storage.getItem(verifierKey);
      const code = callback.searchParams.get("code");
      for (const parameter of ["code", "error", "error_code", "error_description"])
        callback.searchParams.delete(parameter);
      browser.history.replaceState(null, "", callback.pathname + callback.search + callback.hash);
      storage.removeItem(verifierKey);
      storage.removeItem(sessionKey);
      if (!code) return { session: { status: "denied" } };

      saveSession(await post("/auth/v1/token?grant_type=pkce", {
        auth_code: code,
        code_verifier: verifier,
      }));
    }

    const session = await currentSession();
    if (session?.expired) return { session: { status: "expired" } };
    if (!session) return { session: null };
    try {
      return { session: await post("/rest/v1/rpc/b2b_auth_session", {}, session.access_token) };
    } catch (error) {
      if (error.status !== 401) throw error;
      storage.removeItem(sessionKey);
      return { session: { status: "expired" } };
    }
  }

  const services = {
    async signIn({ chooseAccount = false } = {}) {
      const verifier = Array.from(cryptoApi.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, "0")).join("");
      const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      storage.setItem(verifierKey, verifier);

      const authorize = new URL("/auth/v1/authorize", project);
      authorize.search = new URLSearchParams({
        provider: "google",
        scopes: "openid email profile",
        redirect_to: browser.location.origin + browser.location.pathname,
        code_challenge: challenge,
        code_challenge_method: "s256",
        hd: "vajraglobal.com",
        ...(chooseAccount ? { prompt: "select_account" } : {}),
      });
      return { redirectUrl: authorize.href };
    },

    async requestAccess({ note }) {
      const session = await currentSession();
      if (!session?.access_token) throw new Error("Sign in again to send your note.");
      await post("/rest/v1/rpc/b2b_auth_session", { access_note: note }, session.access_token);
      return { message: "Your access request note was saved." };
    },

    async signOut() {
      const session = await currentSession();
      if (session?.access_token) {
        try {
          await post("/auth/v1/logout?scope=local", {}, session.access_token);
        } catch (error) {
          if (![401, 403].includes(error.status)) throw error;
        }
      }
      storage.removeItem(sessionKey);
      storage.removeItem(verifierKey);
      return { data: { session: null } };
    },
  };

  return { readSession, services };
}
