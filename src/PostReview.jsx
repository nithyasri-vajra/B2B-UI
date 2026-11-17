import { useState } from "react";
import {
  Button,
  Card,
  Chip,
  Field,
  Page,
  Table,
  Tabs,
  useAction,
} from "./AdminControls";
import { WorkflowLink } from "./OperatorHome";
import { ReviewDialog } from "./PlanReview";

export default function PostReview({ data, client, run, post, href, action }) {
  const [size, setSize] = useState("Desktop");
  const [tab, setTab] = useState("QA");
  const [profileId, setProfileId] = useState(post?.profileId ?? "");
  const [decision, setDecision] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [comment, setComment] = useState("");
  const { submit, busy, feedback } = useAction(action);
  if (!post || !run || !client)
    return (
      <Page
        title="Gate 2 · Post review"
        actions={
          <WorkflowLink href={href("approvals")}>
            Back to approvals
          </WorkflowLink>
        }
      >
        <Card>
          <p className="muted">Select a post from an approval or run.</p>
        </Card>
      </Page>
    );

  const queue = data.posts.filter(
    (item) =>
      item.clientId === client.id &&
      item.runId === run.id &&
      item.status === "Awaiting approval",
  );
  const index = queue.findIndex((item) => item.id === post.id);
  const profiles = (data.integrations.linkedin?.profiles ?? []).filter(
    (item) =>
      item.eligible !== false &&
      (!item.clientId || item.clientId === client.id),
  );
  const profile = profiles.find((item) => item.id === profileId);
  const approveAllowed =
    post.status === "Awaiting approval" && post.canApprove !== false;
  const connected = profile?.connected === true;
  const handlers = {
    approve: "approvePost",
    hold: "holdPost",
    reject: "rejectPost",
    changes: "requestPostChanges",
  };
  const title = {
    approve: "Approve this version?",
    hold: "Hold this post?",
    reject: "Reject this post?",
    changes: "Request changes",
  };
  const tabs = ["QA", "Claims", "Changes", "Comments"];

  const reviewKey = JSON.stringify([
    post.id,
    post.version,
    post.status,
    post.scheduledAt,
    profile?.id,
    connected,
  ]);
  const stale = Boolean(decision && reviewKey !== reviewed);
  function openDecision(kind) {
    setReviewed(reviewKey);
    setDecision(kind);
  }
  function commit(event) {
    event.preventDefault();
    if (stale || !approveAllowed || (decision === "approve" && !connected))
      return;
    submit(
      handlers[decision],
      {
        runId: run.id,
        postId: post.id,
        version: post.version,
        profileId: profile?.id,
        scheduledAt: post.scheduledAt,
        reason: reason.trim(),
        category,
        requiresStepUp: decision === "approve",
      },
      () => {
        setDecision("");
        setReason("");
        setCategory("");
      },
    );
  }
  return (
    <Page
      title={"Gate 2 · " + (post.title ?? post.id)}
      description={[
        client.name,
        run.period,
        post.version && "version " + post.version,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <>
          <Chip tone="b">{post.status}</Chip>
          {post.qaStatus && <Chip>{post.qaStatus}</Chip>}
        </>
      }
    >
      <div className="admin-row">
        <a href={href("runs", { run: run.id })}>Back to run</a>
        <div className="admin-actions">
          {queue[index - 1] && (
            <WorkflowLink
              href={href("post", { run: run.id, post: queue[index - 1].id })}
            >
              Previous
            </WorkflowLink>
          )}
          {index >= 0 && (
            <span className="muted">
              {index + 1} of {queue.length} awaiting
            </span>
          )}
          {index >= 0 && queue[index + 1] && (
            <WorkflowLink
              href={href("post", { run: run.id, post: queue[index + 1].id })}
            >
              Next
            </WorkflowLink>
          )}
        </div>
      </div>
      <div className="workflow-columns">
        <Card title="LinkedIn preview">
          <Tabs
            values={["Desktop", "Mobile"]}
            value={size}
            onChange={setSize}
          />
          <div
            className={
              "workflow-preview" + (size === "Mobile" ? " mobile" : "")
            }
          >
            <div className="workflow-user">
              <span className="ph">logo</span>
              <div>
                <strong>{profile?.name ?? client.name}</strong>
                <p className="muted">{post.scheduledAt ?? "Unscheduled"}</p>
              </div>
            </div>
            <p className="workflow-copy">
              {post.copy ?? "No draft copy available."}
            </p>
            {post.hashtags?.length > 0 && (
              <p className="workflow-copy">{post.hashtags.join(" ")}</p>
            )}
            {post.cta && <p className="workflow-copy">{post.cta}</p>}
          </div>
          {post.liveUrl && <a href={post.liveUrl}>View published post</a>}
        </Card>
        <Card>
          <Tabs values={tabs} value={tab} onChange={setTab} />
          {tab === "QA" && (
            <Table
              headers={["Check", "Result", "Note"]}
              rows={(post.qa ?? []).map((item) => [
                item.name,
                <Chip
                  tone={
                    item.result === "Pass"
                      ? "g"
                      : item.result === "Block"
                        ? "r"
                        : "a"
                  }
                >
                  {item.result}
                </Chip>,
                item.note ?? "—",
              ])}
              empty="No QA checks available."
            />
          )}
          {tab === "Claims" && (
            <Table
              headers={["Claim", "Record", "Source", "Grade"]}
              rows={(post.claims ?? []).map((item) => [
                item.statement,
                item.recordId,
                item.source,
                item.grade,
              ])}
              empty="No claims recorded."
            />
          )}
          {tab === "Changes" && (
            <Table
              headers={["Before", "After"]}
              rows={(post.changes ?? []).map((item) => [
                item.before,
                item.after,
              ])}
              empty="No changes recorded."
            />
          )}
          {tab === "Comments" && (
            <>
              {post.comments?.length ? (
                post.comments.map((item, i) => (
                  <p key={item.id ?? i}>
                    <strong>{item.author}</strong> {item.text}
                  </p>
                ))
              ) : (
                <p className="muted">No comments yet.</p>
              )}
              <form
                className="workflow-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit(
                    "commentOnPost",
                    { runId: run.id, postId: post.id, text: comment.trim() },
                    () => setComment(""),
                  );
                }}
              >
                <Field label="Comment">
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    required
                  />
                </Field>
                <Button disabled={busy || !comment.trim()} type="submit">
                  Add comment
                </Button>
              </form>
            </>
          )}
          <h2>Publish to</h2>
          <Field label="LinkedIn test profile">
            <select
              value={profileId}
              disabled={!approveAllowed}
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="">Select a profile</option>
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.connected ? "" : " · not connected"}
                </option>
              ))}
            </select>
          </Field>
          {profile && !connected && (
            <Button
              disabled={busy}
              onClick={() =>
                submit("requestProfileConnection", {
                  profileId,
                  postId: post.id,
                  runId: run.id,
                })
              }
            >
              Send connect request
            </Button>
          )}
        </Card>
      </div>
      {feedback}
      <section className="card workflow-foot">
        <div className="admin-row">
          <p className="muted">
            {post.scheduledAt ?? "Unscheduled"} ·{" "}
            {profile?.name ?? "Select a profile"} · Version{" "}
            {post.version ?? "—"}
          </p>
          <div className="admin-actions">
            <Button
              disabled={!approveAllowed || busy}
              onClick={() => openDecision("hold")}
            >
              Hold
            </Button>
            <Button
              disabled={!approveAllowed || busy}
              onClick={() => openDecision("reject")}
            >
              Reject
            </Button>
            <Button
              disabled={!approveAllowed || busy}
              onClick={() => openDecision("changes")}
            >
              Request changes
            </Button>
            <button
              type="button"
              className="btn gate"
              disabled={
                !approveAllowed ||
                !connected ||
                !post.scheduledAt ||
                post.version == null ||
                busy
              }
              onClick={() => openDecision("approve")}
            >
              Approve this version
            </button>
          </div>
        </div>
      </section>
      {decision && (
        <ReviewDialog
          title={title[decision]}
          onClose={() => {
            setDecision("");
            setReason("");
            setCategory("");
          }}
        >
          <form className="workflow-form" onSubmit={commit}>
            {stale && (
              <p role="alert">
                This post changed. Cancel and review the current version.
              </p>
            )}
            {decision === "approve" ? (
              <p>
                {post.title} · Version {post.version} · {profile?.name} ·{" "}
                {post.scheduledAt}
              </p>
            ) : (
              <>
                {decision === "changes" && (
                  <Field label="Reason category">
                    <select
                      required
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      <option value="">Select a category</option>
                      {[
                        "Brand and tone",
                        "Claims and evidence",
                        "Content and CTA",
                        "Schedule",
                        "Other",
                      ].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Reason">
                  <textarea
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              </>
            )}
            {feedback}
            <div className="admin-actions">
              <Button
                className="btn gate"
                type="submit"
                disabled={
                  busy || stale || (decision !== "approve" && !reason.trim())
                }
              >
                {decision === "approve"
                  ? "Re-authenticate and approve"
                  : "Confirm"}
              </Button>
              <Button
                onClick={() => {
                  setDecision("");
                  setReason("");
                  setCategory("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ReviewDialog>
      )}
    </Page>
  );
}
