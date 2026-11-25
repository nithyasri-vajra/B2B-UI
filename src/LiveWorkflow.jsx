import { useState } from "react";
import { Button, Card, Field, Page, Table, Tabs, useAction } from "./AdminControls";
import { rolesForClient } from "./access";
import "./review-screens.css";
import "./approvals.css";

const gates = ["Outputs", "Plans and outlines"];
const isPlan = (review) => review.gate === "gate_1";

export function LiveApprovals({ data }) {
  const [tab, setTab] = useState(gates[0]);
  const [brand, setBrand] = useState("");
  return <Page className="approvals-queue-screen" title="My approvals" description="Reviews assigned to you across your brands.">
    {data.approvalsLoadError && <p role="alert">{data.approvalsLoadError}</p>}
    <Field label="Brand">
      <select value={brand} onChange={(event) => setBrand(event.target.value)}>
        <option value="">All brands</option>
        {data.clients.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </Field>
    <Tabs values={gates} value={tab} onChange={setTab} />
    <Card><Table headers={["Brand", "Review", "Requested", ""]}
      empty="No pending reviews in this view."
      rows={(data.reviewDecisions ?? []).filter((review) => isPlan(review) === (tab === gates[1]) &&
        (!brand || String(review.clientId) === brand)).map((review) => {
        const run = data.runs.find((item) => item.id === String(review.runId));
        const post = data.posts.find((item) => item.id === String(review.contentItemId));
        const query = new URLSearchParams({ client: review.clientId, run: review.runId });
        if (!isPlan(review)) query.set("post", review.contentItemId);
        return { key: review._id, cells: [
          data.clients.find((item) => item.id === String(review.clientId))?.name ?? "Brand",
          (isPlan(review) ? run?.title : post?.title) ?? (isPlan(review) ? "Content plan" : "Output"),
          review.requestedAt ? new Date(review.requestedAt).toLocaleString() : "-",
          run && (isPlan(review) || post) &&
            <a className="btn" href={"#" + (isPlan(review) ? "plan" : "post") + "?" + query}>Review</a>,
        ] };
      })} /></Card>
  </Page>;
}

function Decision({ review, action }) {
  const [decision, setDecision] = useState("approved");
  const [reason, setReason] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const { submit, busy, feedback } = useAction(async (name, values) => {
    try {
      return await action(name, values);
    } catch (error) {
      if (error.code === "reauthentication_required") {
        setStepUp(true);
        throw new Error("Confirm your Google sign-in, then reopen and submit the decision.");
      }
      throw error;
    }
  });
  return <Card title="Your decision">
    {feedback}
    {stepUp ? <Button onClick={() => submit("signIn", { reauthenticate: true })} disabled={busy}>Confirm Google sign-in</Button> :
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        submit("decideReview", { reviewId: review._id, projectId: String(review.projectId), decision, reason });
      }}>
        <Field label="Decision"><select value={decision} onChange={(event) => setDecision(event.target.value)}>
          <option value="approved">Approve</option>
          <option value="changes_requested">Request changes</option>
          <option value="rejected">Reject</option>
        </select></Field>
        <Field label="Reason"><textarea required={decision !== "approved"} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <Button primary type="submit" disabled={busy}>Save decision</Button>
      </form>}
  </Card>;
}

export function LivePlan({ run, data, client, action, href }) {
  const [selected, setSelected] = useState([]);
  const [askApprover, setAskApprover] = useState(false);
  const { submit, busy, feedback } = useAction(action);
  const plan = run?.planRevisions?.at(-1);
  const review = data.reviewDecisions?.find((entry) => isPlan(entry) && String(entry.runId) === run?.id &&
    entry.planVersion === plan?.version);
  const mayRequest = run?.currentStageKey === "gate_1" &&
    rolesForClient(data.session, client?.id).some((role) => ["approver", "marketing_operator"].includes(role));
  const ids = plan?.items?.map((item) => String(item.itemId)) ?? [];
  const selection = selected.filter((id) => ids.includes(id));
  return <Page className="plan-review-screen" title="Approve content plan" description={run?.title ?? "Gate 1"}>
    {run && <a href={href("runs", { run: run.id })}>Back to run</a>}
    {feedback}
    <Card title={plan ? "Plan version " + plan.version : "Content plan"}>
      <Table headers={["Selected", "Topic", "Pillar", "Call to action"]} empty="No plan items are available."
        rows={(plan?.items ?? []).map((item) => {
          const id = String(item.itemId);
          const checked = (review ? review.selectedPlanItemIds?.map(String) ?? [] : selection).includes(id);
          return { key: id, cells: [
            <input type="checkbox" aria-label={"Select " + (item.title ?? item.topic ?? "plan item")} checked={checked}
              disabled={!mayRequest || Boolean(review)} onChange={() => setSelected((current) =>
                checked ? current.filter((entry) => entry !== id) : [...current, id])} />,
            item.title ?? item.topic ?? item.angle ?? id, item.pillar ?? "-", item.callToAction ?? "-",
          ] };
        })} />
      {mayRequest && !review && ids.length > 0 && !["awaiting_plan_approval", "Awaiting plan approval"].includes(run.status) && <>
        <label><input type="checkbox" checked={askApprover} onChange={(event) => setAskApprover(event.target.checked)} /> Also ask the named approver</label>{" "}
        <Button primary disabled={busy || !selection.length} onClick={() => submit("requestPlanApproval", {
          runId: run.id, planVersion: plan.version, selectedPlanItemIds: selection, askApprover,
        })}>Request plan review</Button>
      </>}
    </Card>
    {review && <Decision key={review._id} review={review} action={action} />}
  </Page>;
}

export function LivePost({ post, run, data, client, action, href }) {
  const [draft, setDraft] = useState(null);
  const { submit, busy, feedback } = useAction(action);
  const review = data.reviewDecisions?.find((entry) => entry.gate === "gate_2" &&
    String(entry.contentItemId) === post?.id && String(entry.draftVersionId) === String(post?.currentDraftVersionId));
  const canEdit = post?.currentDraftVersionId && run &&
    rolesForClient(data.session, client?.id).some((role) => ["approver", "marketing_operator"].includes(role)) &&
    !["publishing", "published", "cancelled"].includes(String(post.status).toLowerCase());
  return <Page className="post-review-screen" title={post?.title ?? "Approve output"} description={post ? "Gate 2 · " + (post.status ?? "Draft") : "Select an output to review."}>
    {href("approvals") && <a href={href("approvals")}>My approvals</a>}
    {feedback}
    <Card title={post?.version != null ? "Preview · Version " + post.version : "Preview"}>
      {draft ? <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        submit("savePostDraft", { runId: run.id, postId: post.id, currentDraftVersionId: draft.id, text: draft.text }, () => setDraft(null));
      }}>
        <Field label="Draft text"><textarea required value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></Field>
        <Button primary type="submit" disabled={busy}>Save draft revision</Button>{" "}
        <Button onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
      </form> : <>
        <p style={{ whiteSpace: "pre-wrap" }}>{post?.copy ?? "No draft text is available."}</p>
        {canEdit && <Button onClick={() => setDraft({ id: post.currentDraftVersionId, text: post.copy ?? "" })}>Edit draft</Button>}
      </>}
    </Card>
    {review && <Decision key={review._id} review={review} action={action} />}
    <p className="muted">Creating new output reviews and scheduling, publishing, or verifying on LinkedIn are unavailable.</p>
  </Page>;
}
