import { useState } from "react";
import { Button, Card, Chip, Field, useAction } from "./AdminControls";

export default function SignIn({ data, action }) {
  const [note, setNote] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const session = data.session;
  const status = session?.status;
  const requested = status === "pending";
  const denied = status === "denied";
  const expired = status === "expired";

  return (
    <main className="workflow-auth">
      <p className="wf">
        SSO only
        {data.integrations.google?.domain &&
          ", @" + data.integrations.google.domain}
      </p>
      <Card>
        {requested ? (
          <>
            <div>
              <Chip tone="a">Access requested</Chip>
            </div>
            <h1>You're signed in, but don't have access yet</h1>
            <p className="muted">
              {session.email && "Signed in as " + session.email + ". "}A
              Platform Admin needs to assign your role and clients.
            </p>
            <form
              className="admin-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit("requestAccess", { note: note.trim() }, () =>
                  setNote(""),
                );
              }}
            >
              <Field label="Note for the admin (optional)">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
              <div className="admin-actions">
                <Button primary type="submit" disabled={busy}>
                  Send note
                </Button>
                <Button disabled={busy} onClick={() => submit("signOut")}>
                  Sign out
                </Button>
              </div>
            </form>
          </>
        ) : denied ? (
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
        ) : expired ? (
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
        ) : (
          <>
            <span className="ph workflow-auth-logo">logo</span>
            <h1>B2B Agents</h1>
            <p className="muted">
              Vajra Global's agent workspace. Use your Vajra Global work
              account.
            </p>
            <Button primary disabled={busy} onClick={() => submit("signIn")}>
              Sign in with Vajra Global account
            </Button>
            <p className="muted">
              You'll be sent to the company sign-in page. Multi-factor
              authentication is handled there.
            </p>
          </>
        )}
        {feedback}
      </Card>
    </main>
  );
}
