import { useEffect, useState } from "react";
import { Button, Card, Field, Page, Table, Tabs, useAction } from "./AdminControls";
import { rolesForClient } from "./access";
import { createAuthServices } from "./authServices";
import "./review-screens.css";
import "./approvals.css";

const gates = ["Outputs", "Plans and outlines"];
const isPlan = (review) => review.gate === "gate_1";
const authApiPath = import.meta.env.VITE_AUTH_API_PATH;

export function LiveApprovals({ data }) {
  const [tab, setTab] = useState(gates[0]);
  const [brand, setBrand] = useState("");
  const [latest, setLatest] = useState(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!authApiPath) return;
    let active = true;
    createAuthServices(authApiPath).services.loadApprovals().then(({ reviewDecisions }) => {
      if (active) setLatest(reviewDecisions);
    }).catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, []);
  return <Page className="approvals-queue-screen" title="My approvals" description="Reviews assigned to you across your brands.">
    {(loadError || (!latest && data.approvalsLoadError)) && <p role="alert">{loadError || data.approvalsLoadError}</p>}
    <Field label="Brand">
      <select value={brand} onChange={(event) => setBrand(event.target.value)}>
        <option value="">All brands</option>
        {data.clients.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </Field>
    <Tabs values={gates} value={tab} onChange={setTab} />
    <Card><Table headers={["Brand", "Review", "Requested", ""]}
      empty="No pending reviews in this view."
      rows={(latest ?? data.reviewDecisions ?? []).filter((review) => isPlan(review) === (tab === gates[1]) &&
        (!brand || String(review.clientId) === brand)).map((review) => {
        const run = data.runs.find((item) => item.id === String(review.runId));
        const post = data.posts.find((item) => item.id === String(review.contentItemId));
        const query = new URLSearchParams({ client: review.clientId, run: review.runId });
        if (!isPlan(review)) query.set("post", review.contentItemId);
        const reviewHref = "#" + (isPlan(review) ? "plan" : "post") + "?" + query;
        const needsRefresh = !isPlan(review) && (!run || !post ||
          !data.reviewDecisions?.some((entry) => entry._id === review._id));
        return { key: review._id, cells: [
          data.clients.find((item) => item.id === String(review.clientId))?.name ?? "Brand",
          (isPlan(review) ? run?.title : post?.title) ?? (isPlan(review) ? "Content plan" : "Output"),
          review.requestedAt ? new Date(review.requestedAt).toLocaleString() : "-",
          (run || !isPlan(review)) && <a className="btn" href={reviewHref} onClick={needsRefresh ? (event) => {
            event.preventDefault();
            window.location.hash = reviewHref;
            window.location.reload();
          } : undefined}>Review</a>,
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

const toLocalInput = (value) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

// Post review (Gate 2): no reject. The reviewer reads the post and either describes
// what should change and regenerates it (as often as needed), or approves it with a
// publishing date, which puts it on the calendar and into the publishing pipeline.
function PostFeedback({ post, run, review, mayFinalize, canRegenerate, action }) {
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState(review?.scheduledAt ? toLocalInput(review.scheduledAt) : "");
  const [stepUp, setStepUp] = useState(false);
  const regenerate = useAction(action);
  const finalize = useAction(async (name, values) => {
    try {
      return await action(name, values);
    } catch (error) {
      if (error.code === "reauthentication_required") {
        setStepUp(true);
        throw new Error("Confirm your Google sign-in, then reopen the post and mark it as final.");
      }
      throw error;
    }
  });
  const running = post.regeneration?.status === "running";
  const history = (post.draftVersions ?? []).filter((entry) => entry.reviewerFeedback)
    .sort((a, b) => b.version - a.version);
  return <Card title="Feedback">
    {running ? <p role="status">Regenerating the post with your feedback. The new version appears here when it is ready.</p> : <>
      {post.regeneration?.status === "failed" && <p role="alert">The last regeneration did not finish: {post.regeneration.failureReason ?? "try again."}</p>}
      {post.regeneration?.qaNote && post.regeneration.status === "completed" && !review &&
        <p className="muted">Quality check note on the new version: {post.regeneration.qaNote}</p>}
      {canRegenerate && <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        regenerate.submit("regeneratePost", {
          runId: run.id, postId: post.id, currentDraftVersionId: post.currentDraftVersionId, feedback: text.trim(),
        }, () => setText(""));
      }}>
        <Field label="What should change?">
          <textarea required maxLength={4000} rows={5} value={text} disabled={regenerate.busy}
            placeholder="For example: make the opening line about the client's problem, cut the last paragraph and end with a question."
            onChange={(event) => setText(event.target.value)} />
        </Field>
        <Button primary type="submit" disabled={regenerate.busy || !text.trim()}>
          {regenerate.busy ? "Sending…" : "Regenerate"}
        </Button>
      </form>}
      {regenerate.feedback}
      {review && mayFinalize && (stepUp
        ? <div className="admin-actions" style={{ marginTop: 16 }}>
          <Button onClick={() => finalize.submit("signIn", { reauthenticate: true })} disabled={finalize.busy}>Confirm Google sign-in</Button>
          {finalize.feedback}
        </div>
        : <form className="admin-form" style={{ marginTop: 16 }} onSubmit={(event) => {
          event.preventDefault();
          finalize.submit("decideReview", {
            reviewId: review._id, projectId: String(review.projectId), decision: "approved", reason: "",
            scheduledAt: new Date(schedule).toISOString(),
          });
        }}>
          <Field label="Publish on (your local time)">
            <input type="datetime-local" required value={schedule} min={toLocalInput(new Date())}
              disabled={finalize.busy} onChange={(event) => setSchedule(event.target.value)} />
          </Field>
          <Button primary type="submit" disabled={finalize.busy || !schedule}>Approve and schedule</Button>
          {finalize.feedback}
        </form>)}
    </>}
    {history.length > 0 && <>
      <p><strong>Earlier feedback</strong></p>
      <ul>{history.map((entry) => <li key={String(entry._id ?? entry.id)}>
        Version {entry.version - 1} → {entry.version}: {entry.reviewerFeedback}
      </li>)}</ul>
    </>}
  </Card>;
}

export function LivePlan({ run, data, client, action, href }) {
  const [selected, setSelected] = useState([]);
  const { submit, busy, feedback } = useAction(action);
  const plan = run?.planRevisions?.at(-1);
  const roles = rolesForClient(data.session, client?.id);
  const operator = roles.includes("operator");
  const approver = roles.includes("approver");
  const review = !client?.archived && data.reviewDecisions?.find((entry) => isPlan(entry) && entry.status === "pending" &&
    String(entry.runId) === run?.id && entry.planVersion === plan?.version &&
    (entry.reviewType === "owner" ? run?.isOwner === true && operator :
      entry.reviewType === "requested_approver" && run?.isOwner === false && approver));
  const mayRequest = run?.isOwner === true && run.currentStageKey === "gate_1" &&
    (operator || approver) && !client?.archived &&
    !run.reviewDecisions?.some((entry) => entry.planVersion === plan?.version &&
      ["pending", "decided"].includes(entry.status));
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
        {!operator && <p className="muted">The brand's named approver will review this plan.</p>}
        <Button primary disabled={busy || !selection.length} onClick={() => submit("requestPlanApproval", {
          runId: run.id, planVersion: plan.version, selectedPlanItemIds: selection, askApprover: !operator,
        })}>Request plan review</Button>
      </>}
    </Card>
    {review && <Decision key={review._id} review={review} action={action} />}
  </Page>;
}

export function LivePost({ post, run, data, action, href }) {
  const [draft, setDraft] = useState(null);
  const regenerating = post?.regeneration?.status === "running";
  // While a regeneration runs in the background, refresh the post every 10 seconds.
  useEffect(() => {
    if (!regenerating || !post?.projectId) return;
    const timer = setInterval(() => {
      action("loadPostDetail", { projectId: post.projectId, postId: post.id })
        .then(() => action("refreshApprovals").catch(() => {}))
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [regenerating, post?.projectId, post?.id, action]);
  const [destination, setDestination] = useState("");
  const [schedule, setSchedule] = useState("");
  const [sentReview, setSentReview] = useState(null);
  const { submit, busy, feedback } = useAction(action);
  const request = useAction(async () => {
    const base = new URL(authApiPath, window.location.origin);
    if (base.origin !== window.location.origin || base.pathname.startsWith("//") ||
        base.search || base.hash || base.username || base.password)
      throw new Error("The authentication API must use a same-origin path.");
    const path = "/workflow/projects/" + encodeURIComponent(post.projectId) +
      "/posts/" + encodeURIComponent(post.id) + "/gate-2-review";
    const response = await fetch(base.pathname.replace(/\/$/, "") + path, {
      method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        draftVersionId: post.currentDraftVersionId, destination: selectedDestination,
        scheduledAt: schedule ? new Date(schedule).toISOString() : null,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.reviewDecision)
      throw new Error(result?.message ?? "Could not request Gate 2 review. Refresh the draft and try again.");
    setSentReview(result.reviewDecision);
    return { message: "Gate 2 review sent to the named approver." };
  });
  const matchesDraft = (entry) => entry?.gate === "gate_2" &&
    String(entry.draftVersionId) === String(post?.currentDraftVersionId);
  const review = data.reviewDecisions?.find((entry) => entry.gate === "gate_2" && entry.status === "pending" &&
    String(entry.contentItemId) === post?.id && String(entry.draftVersionId) === String(post?.currentDraftVersionId));
  const currentReview = review ?? (matchesDraft(sentReview) ? sentReview :
    post?.reviewDecisions?.find((entry) => matchesDraft(entry) && ["pending", "decided"].includes(entry.status)));
  const currentDraft = post?.draftVersions?.find((entry) =>
    String(entry._id ?? entry.id) === String(post.currentDraftVersionId));
  const qaPassed = Array.isArray(currentDraft?.qaChecks) && currentDraft.qaChecks.length > 0 &&
    currentDraft.qaChecks.every((check) => check?.verdict === "PASS");
  const destinations = post?.gate2Destinations ?? [];
  const selectedDestination = destinations.includes(destination) ? destination : destinations[0] ?? "";
  const canEdit = post?.currentDraftVersionId && run && post.canEditDraft === true;
  return <Page className="post-review-screen" title={post?.title ?? "Approve output"} description={post ? "Gate 2 · " + (post.status ?? "Draft") : "Select an output to review."}>
    {href("approvals") && <a href={href("approvals")}>My approvals</a>}
    {feedback}
    <Card title={post?.version != null ? "Preview · Version " + post.version : "Preview"}>
      {draft && canEdit ? <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        submit("savePostDraft", { runId: run.id, postId: post.id, currentDraftVersionId: draft.id, text: draft.text }, () => setDraft(null));
      }}>
        <Field label="Draft text"><textarea required value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></Field>
        <Button primary type="submit" disabled={busy}>Save draft revision</Button>{" "}
        <Button onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
      </form> : <>
        <p style={{ whiteSpace: "pre-wrap" }}>{post?.copy ?? "No draft text is available."}</p>
        {currentDraft?.qaFixRounds > 0 && <p className="muted">Quality check asked for changes, so the writer
          rewrote this draft automatically {currentDraft.qaFixRounds === 1 ? "once" : currentDraft.qaFixRounds + " times"} before review.</p>}
        {canEdit && <Button disabled={request.busy} onClick={() => setDraft({ id: post.currentDraftVersionId, text: post.copy ?? "" })}>Edit draft</Button>}
      </>}
    </Card>
    {currentReview && <Card title="Gate 2 request">
      <p>Draft version {post.version} · {currentReview.status === "pending" ? "Awaiting approval" : currentReview.decision?.replace(/_/g, " ")}</p>
      <p>Destination {currentReview.destination}</p>
      <p>{currentReview.scheduledAt ? "Scheduled for " + new Date(currentReview.scheduledAt).toLocaleString() : "Unscheduled"}</p>
    </Card>}
    {canEdit && !draft && !currentReview && qaPassed && !["approved", "failed", "completed", "cancelled"].includes(
      String(post.status).toLowerCase(),
    ) && <Card title="Request Gate 2 review">
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        if (selectedDestination && !request.busy) request.submit("requestGate2Review");
      }}>
        <Field label="Destination"><select required value={selectedDestination} disabled={request.busy}
          onChange={(event) => setDestination(event.target.value)}>
          {!destinations.length && <option value="">No available destination</option>}
          {destinations.map((value) => <option key={value} value={value}>{value === "linkedin" ? "LinkedIn" : value}</option>)}
        </select></Field>
        <Field label="Schedule (optional, local time)"><input type="datetime-local" value={schedule}
          disabled={request.busy} onChange={(event) => setSchedule(event.target.value)} /></Field>
        <Button primary type="submit" disabled={request.busy || !selectedDestination}>Request Gate 2 review</Button>
      </form>
    </Card>}
    {request.feedback}
    {post && run && (canEdit || (review && post.mayDecideGate2)) &&
      !["approved", "publishing", "published", "cancelled"].includes(String(post.status).toLowerCase()) &&
      <PostFeedback key={String(post.currentDraftVersionId)} post={post} run={run} review={review}
        mayFinalize={post.mayDecideGate2 === true} canRegenerate={canEdit && !draft} action={action} />}
    <p className="muted">Publishing and verification on LinkedIn are unavailable.</p>
  </Page>;
}
