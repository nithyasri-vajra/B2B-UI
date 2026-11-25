import { useState } from "react";
import { Button, Card, Chip, Field, useAction } from "./AdminControls";
import "./sign-in.css";

export default function SignIn({ data, action }) {
  const [note, setNote] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const session = data.session;
  const status = session?.status;
  const requested = status === "pending";
  const denied = status === "denied";
  const expired = status === "expired";

  if (!denied && !expired) {
    const domain = data.integrations.google?.domain;

    return (
      <main className="sign-in">
        <div className="sign-in-intro">
          <div className="sign-in-brand">
            <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20">
              <path d="M1 3h18l-9 15L1 3zm5 2 4 8 4-8H6z" fill="currentColor" fillRule="evenodd" />
            </svg>
            B2B Agents
          </div>
          <div className="sign-in-copy">
            <p className="sign-in-eyebrow">Vajra Global</p>
            <p className="sign-in-headline">Plan, write and publish brand content with your agents.</p>
            <p>Every brand keeps its own knowledge. Every post passes two human approvals before it goes live.</p>
          </div>
          <small>Vajra Global internal tool · access with your work account</small>
        </div>
        <div className="sign-in-panel">
          <section
            className={requested ? "sign-in-card waiting-access-card" : "sign-in-card"}
            aria-labelledby="sign-in-title"
          >
            {requested ? (
              <>
                <span className="waiting-access-badge">Waiting for access</span>
                <h1 id="sign-in-title">You're signed in, but not on a brand yet</h1>
                <p>
                  {session.email && <>Signed in as {session.email}. </>}
                  Ask your Brand Manager to add you to their brand, or tell the
                  Platform Admin which brand you work on.
                </p>
                <form
                  className="waiting-access-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit("requestAccess", { note: note.trim() }, () => setNote(""));
                  }}
                >
                  <Field label="Message to the Platform Admin (optional)">
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                  <div className="waiting-access-actions">
                    <Button className="waiting-access-send" type="submit" disabled={busy}>
                      Send request
                    </Button>
                    <Button disabled={busy} onClick={() => submit("signOut")}>
                      Sign out
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h1 id="sign-in-title">Sign in</h1>
                <p>Use your {domain ? "@" + domain : "Vajra Global work"} Google account.</p>
                <Button className="sign-in-google" disabled={busy} onClick={() => submit("signIn")}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15">
                    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.27-2.09 3.56-5.17 3.56-8.85Z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.88l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.13 0-5.78-2.11-6.74-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
                    <path fill="#FBBC05" d="M5.26 14.32a7.2 7.2 0 0 1 0-4.64v-3.1H1.27a12 12 0 0 0 0 10.84l3.99-3.1Z" />
                    <path fill="#EA4335" d="M12 4.73c1.77 0 3.34.61 4.59 1.8l3.44-3.44A11.52 11.52 0 0 0 12 0 12 12 0 0 0 1.27 6.58l3.99 3.1A7.15 7.15 0 0 1 12 4.73Z" />
                  </svg>
                  Continue with Google
                </Button>
                <p className="sign-in-help">Personal Gmail accounts can’t sign in. Need access? Your Brand Manager or Platform Admin can add you.</p>
              </>
            )}
            {feedback}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="workflow-auth">
      <p className="wf">
        SSO only
        {data.integrations.google?.domain &&
          ", @" + data.integrations.google.domain}
      </p>
      <Card>
        {denied ? (
          <>
            <div>
              <Chip tone="r">Access denied</Chip>
            </div>
            <h1>This account can't use B2B Agents</h1>
            <p className="muted">
              {session.reason ?? "Contact your Platform Admin for access."}
            </p>
            <div>
              <Button
                disabled={busy}
                onClick={() => submit("signIn", { chooseAccount: true })}
              >
                Try a different account
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <Chip tone="a">Session expired</Chip>
            </div>
            <h1>Session expired</h1>
            <p className="muted">Sign in again to continue.</p>
            <div>
              <Button primary disabled={busy} onClick={() => submit("signIn")}>
                Sign in again
              </Button>
            </div>
          </>
        )}
        {feedback}
      </Card>
    </main>
  );
}
