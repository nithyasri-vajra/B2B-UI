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
import { canOpenPage, canPerformAction, isPlatformAdmin, rolesForClient } from "./access";
import "./approvals.css";

const tabs = ["Plans and outlines", "Outputs", "Decided"];

export default function ApprovalsQueue({ data, client, href, action }) {
  const [view, setView] = useState(tabs[1]);
  const [brand, setBrand] = useState("");
  const [agent, setAgent] = useState("");
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [reviewed, setReviewed] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const session = data.session;
  const brands = data.clients.filter(({ id, archived }) => !archived && (
    session?.status === "active" ? !isPlatformAdmin(session) &&
      rolesForClient(session, id).some((role) => ["approver", "marketing_operator"].includes(role))
      : id === client?.id
  ));
  const brandNames = new Map(brands.map(({ id, name }) => [id, name]));
  const findRun = (item) => data.runs.find(({ id, clientId }) => id === item.runId && clientId === item.clientId);
  const agentId = (item) => item.agentId ?? findRun(item)?.agentId;
  const accessible = data.approvals.filter((item) => {
    if (!brandNames.has(item.clientId) || ![1, 2].includes(item.gate)) return false;
    if (session?.status !== "active") return true;
    const run = findRun(item);
    if (!run) return false;
    return canPerformAction(session, item.clientId, item.gate === 1 ? "approvePlan" : "approvePost", run, { separation: run.separation === true });
  });
  const agents = [...new Set(accessible.map(agentId).filter(Boolean))];
  const all = accessible.filter((item) => (!brand || item.clientId === brand) && (!agent || agentId(item) === agent));
  function reviewHref(item) {
    const target = item.gate === 1 ? "plan" : "post";
    const ids = { run: item.runId, post: item.postId };
    if (item.clientId === client?.id) return href(target, ids);
    if (!canOpenPage(session, item.clientId, target)) return undefined;
    const query = new URLSearchParams({ client: item.clientId, run: item.runId });
    if (item.postId) query.set("post", item.postId);
    return "#" + target + "?" + query;
  }
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
        (!profile.clientId || profile.clientId === item.clientId),
    );
    const ready =
      item.clientId === client?.id && item.canApprove !== false &&
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
    <Page className="my-approvals" title="My approvals" description="Everything waiting for your decision across your brands and agents."
      actions={<>
        <select aria-label="Filter by brand" value={brand} onChange={(event) => { setBrand(event.target.value); setSelected([]); }}>
          <option value="">All brands</option>
          {brands.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Filter by agent" value={agent} onChange={(event) => { setAgent(event.target.value); setSelected([]); }}>
          <option value="">All agents</option>
          {agents.map((id) => <option key={id} value={id}>{data.agents.find((entry) => entry.id === id)?.name ?? id}</option>)}
        </select>
      </>}>
      <Card>
        <div className="admin-row">
          <Tabs
            values={[
              tabs[1] + " · " + posts.length,
              tabs[0] + " · " + plans.length,
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
            profile and a scheduled time. To approve a batch, switch to its brand first.
          </p>
        )}
        <Table
          headers={[
            ...(view === tabs[1] ? ["Select"] : []),
            "Brand",
            "Type",
            "Output",
            "Due",
            "QA",
            "Goes to",
            "Waiting since",
            ...(view === tabs[2] ? ["Decision"] : []),
            "",
          ]}
          rows={list.map((item) => {
            const run = findRun(item);
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
              brandNames.get(item.clientId),
              <Chip>{item.type ?? (item.gate === 1 ? "Plan" : "LinkedIn post")}</Chip>,
              <div><strong>{label}</strong><div className="muted">{data.agents.find(({ id }) => id === agentId(item))?.name}</div></div>,
              candidate?.post?.scheduledAt ?? item.dueAt ?? "—",
              item.qaStatus ?? candidate?.post?.qaStatus ?? "-",
              item.destination ?? candidate?.profile?.name ?? "-",
              item.waitingSince ?? "—",
              ...(view === tabs[2] ? [<Chip>{item.status}</Chip>] : []),
              reviewHref(item) && <a className="btn pri" href={reviewHref(item)}>Review</a>,
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
      {view === tabs[1] && plans.filter(reviewHref).map((item) => (
        <Card key={item.id}>
          <div className="admin-row">
            <div><strong>Plan review requested</strong><p className="muted">{item.title ?? brandNames.get(item.clientId)}</p></div>
            <a className="btn" href={reviewHref(item)}>Open plan</a>
          </div>
        </Card>
      ))}
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
