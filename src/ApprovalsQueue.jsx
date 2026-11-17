import { useState } from "react";
import {
  Button,
  Card,
  Chip,
  Page,
  Table,
  Tabs,
  useAction,
} from "./AdminControls";
import { ReviewDialog } from "./PlanReview";

const tabs = ["Plans (Gate 1)", "Posts (Gate 2)", "Decided · last 30 days"];

export default function ApprovalsQueue({ data, client, href, action }) {
  const [view, setView] = useState(tabs[0]);
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const all = client
    ? data.approvals.filter((item) => item.clientId === client.id)
    : [];
  const plans = all.filter(
    (item) => item.gate === 1 && item.status === "Pending",
  );
  const posts = all.filter(
    (item) => item.gate === 2 && item.status === "Pending",
  );
  const cutoff = Date.now() - 30 * 86400000;
  const list =
    view === tabs[0]
      ? plans
      : view === tabs[1]
        ? posts
        : all.filter(
            (item) =>
              item.status !== "Pending" && Date.parse(item.decidedAt) >= cutoff,
          );
  const candidates = posts.map((item) => {
    const post = data.posts.find(
      (post) =>
        post.id === item.postId &&
        post.clientId === item.clientId &&
        post.runId === item.runId,
    );
    const profile = data.integrations.linkedin?.profiles?.find(
      (profile) =>
        profile.id === post?.profileId &&
        (!profile.clientId || profile.clientId === client?.id),
    );
    const ready =
      item.canApprove !== false &&
      post?.status === "Awaiting approval" &&
      post.version != null &&
      post.scheduledAt &&
      profile?.connected &&
      profile.eligible !== false;
    return { item, post, profile, ready };
  });
  const chosen = candidates.filter(
    (row) => row.ready && selected.includes(row.item.id),
  );
  const runId = chosen[0]?.item.runId;
  const valid =
    chosen.length > 0 && chosen.every((row) => row.item.runId === runId);
  const reviewKey = JSON.stringify(
    chosen.map(({ item, post, profile }) => [
      item.id,
      post.version,
      post.scheduledAt,
      profile.id,
    ]),
  );
  const stale = confirm && reviewKey !== reviewed;
  function toggle(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <Page title="Approvals" description={client?.name}>
      <Card>
        <div className="admin-row">
          <Tabs
            values={[
              tabs[0] + " · " + plans.length,
              tabs[1] + " · " + posts.length,
              tabs[2],
            ]}
            value={
              view === tabs[0]
                ? tabs[0] + " · " + plans.length
                : view === tabs[1]
                  ? tabs[1] + " · " + posts.length
                  : tabs[2]
            }
            onChange={(value) => {
              setView(
                value.startsWith(tabs[0])
                  ? tabs[0]
                  : value.startsWith(tabs[1])
                    ? tabs[1]
                    : tabs[2],
              );
              setSelected([]);
            }}
          />
          {view === tabs[1] && (
            <button
              type="button"
              className="btn gate"
              disabled={!valid || busy}
              onClick={() => {
                setReviewed(reviewKey);
                setConfirm(true);
              }}
            >
              Approve selected (same run only)
            </button>
          )}
        </div>
        {view === tabs[1] && (
          <p className="muted">
            Batch approval requires posts from one run with a connected test
            profile and a scheduled time.
          </p>
        )}
        <Table
          headers={[
            ...(view === tabs[1] ? ["Select"] : []),
            "Item",
            "Client · run",
            "Due / publishes",
            "Waiting since",
            "Requested by",
            "Status",
            "",
          ]}
          rows={list.map((item) => {
            const run = data.runs.find(
              (run) => run.id === item.runId && run.clientId === client?.id,
            );
            const candidate = candidates.find((row) => row.item.id === item.id);
            const label =
              item.title ?? candidate?.post?.title ?? run?.name ?? item.id;
            return [
              ...(view === tabs[1]
                ? [
                    <input
                      aria-label={"Select " + label}
                      type="checkbox"
                      checked={chosen.some((row) => row.item.id === item.id)}
                      disabled={
                        !candidate?.ready ||
                        Boolean(runId && runId !== item.runId)
                      }
                      onChange={() => toggle(item.id)}
                    />,
                  ]
                : []),
              label,
              [client?.name, run?.name ?? run?.period]
                .filter(Boolean)
                .join(" · "),
              candidate?.post?.scheduledAt ?? item.dueAt ?? "—",
              item.waitingSince ?? "—",
              item.requestedBy ?? "—",
              <Chip tone={item.status === "Pending" ? "b" : undefined}>
                {item.status}
              </Chip>,
              <a
                href={href(item.gate === 1 ? "plan" : "post", {
                  run: item.runId,
                  post: item.postId,
                })}
              >
                Review
              </a>,
            ];
          })}
          empty={
            view === tabs[2]
              ? "No decisions in the last 30 days."
              : "Nothing is waiting for your approval."
          }
        />
        {feedback}
      </Card>
      {confirm && (
        <ReviewDialog
          title={"Approve " + chosen.length + " posts for publishing?"}
          onClose={() => setConfirm(false)}
        >
          {stale && (
            <p role="alert">
              Selected posts changed. Cancel and review the current versions.
            </p>
          )}
          <ul>
            {chosen.map(({ item, post, profile }) => (
              <li key={item.id}>
                {post.title} · Version {post.version} · {profile.name} ·{" "}
                {post.scheduledAt}
              </li>
            ))}
          </ul>
          {feedback}
          <div className="admin-actions">
            <Button
              className="btn gate"
              disabled={busy || stale || !valid}
              onClick={() => {
                if (stale || !valid) return;
                submit(
                  "approvePosts",
                  {
                    runId,
                    requiresStepUp: true,
                    posts: chosen.map(({ item, post, profile }) => ({
                      approvalId: item.id,
                      postId: post.id,
                      version: post.version,
                      profileId: profile.id,
                      scheduledAt: post.scheduledAt,
                    })),
                  },
                  () => {
                    setConfirm(false);
                    setSelected([]);
                  },
                );
              }}
            >
              Re-authenticate and approve {chosen.length}
            </Button>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        </ReviewDialog>
      )}
    </Page>
  );
}
