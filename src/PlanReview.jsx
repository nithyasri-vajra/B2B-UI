import { rolesForClient } from "./access";
import { useEffect, useRef, useState } from "react";
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
import "./review-screens.css";

export function ReviewDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="card admin-card workflow-review-dialog"
      aria-labelledby="review-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="review-confirm-title">{title}</h2>
      {children}
    </dialog>
  );
}

export function PreviewDraftResults({ run, action, renderStage }) {
  const { submit, busy, feedback } = useAction(action);
  if (run.gate1?.decision !== "Approved") return null;
  const result = run.draftingResult;
  return (
    <Card title="Drafting and quality review">
      {result?.running && <p role="status">Generating drafts and running quality checks…</p>}
      {result?.error && <p role="alert">{result.error}</p>}
      {(!result || result.error) && (
        <Button primary disabled={busy} onClick={() => submit("retryPreviewDraft", { runId: run.id })}>
          {result?.error ? "Retry drafting" : "Start drafting"}
        </Button>
      )}
      {[
        ["Writing context", result?.context],
        ["Post Writer drafts", result?.writer],
        ["Quality review context", result?.qaContext],
        ["Post Quality Analyst", result?.qa],
      ].map(([name, stage]) => stage && (renderStage ? renderStage(name, stage) : (
        <details key={name} open={name === "Post Writer drafts" || name === "Post Quality Analyst" || stage.verdict === "BLOCKED"}>
          <summary>{name} · {stage.verdict}</summary>
          <pre className="knowledge-record-content">{stage.report}</pre>
        </details>
      )))}
      {feedback}
    </Card>
  );
}

function PreviewPlanReview({ run, href, action }) {
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const plan = run.planningResult.planner;
  const pending = run.status === "Awaiting Gate 1";

  return (
    <Page
      className="review-screen"
      title="Approve content plan · Gate 1"
      description={run.period}
      actions={<WorkflowLink href={href("runs", { run: run.id })}>Back to run</WorkflowLink>}
    >
      <Card title="Proposed content plan">
        <Chip>{run.gate1?.decision ?? "Awaiting approval"}</Chip>
        {run.gate1?.reason && <p>{run.gate1.reason}</p>}
        <pre className="knowledge-record-content">{plan.report}</pre>
        {pending && (
          <div className="admin-actions">
            <Button primary onClick={() => setDecision("Approved")}>Approve for drafting</Button>
            <Button onClick={() => setDecision("Rejected")}>Reject plan</Button>
          </div>
        )}
        {!decision && feedback}
      </Card>
      <PreviewDraftResults run={run} action={action} />
      {pending && decision && (
        <ReviewDialog
          title={decision === "Approved" ? "Approve this plan for drafting?" : "Reject this plan?"}
          onClose={() => { if (!busy) setDecision(""); }}
        >
          <form className="workflow-form" onSubmit={(event) => {
            event.preventDefault();
            submit("decidePreviewPlan", { runId: run.id, report: plan.report, decision, reason }, () => setDecision(""));
          }}>
            {decision === "Approved" ? (
              <p>This approval covers drafting. Publishing requires a separate approval.</p>
            ) : (
              <Field label="Reason">
                <textarea required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            )}
            {feedback}
            <div className="admin-actions">
              <Button primary type="submit" disabled={busy || (decision === "Rejected" && !reason.trim())}>
                {decision === "Approved" ? "Confirm approval" : "Confirm rejection"}
              </Button>
              <Button disabled={busy} onClick={() => setDecision("")}>Cancel</Button>
            </div>
          </form>
        </ReviewDialog>
      )}
    </Page>
  );
}

export default function PlanReview(props) {
  const { run, preview } = props;
  if (preview && ["Awaiting Gate 1", "Plan approved", "Plan rejected"].includes(run?.status))
    return <PreviewPlanReview {...props} />;
  return <PlanItemReview {...props} />;
}

function PlanItemReview({ data, client, run, href, action, canAct = () => true }) {
  const [view, setView] = useState("Table");
  const [selected, setSelected] = useState([]);
  const [requiresApprover, setRequiresApprover] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState(null);
  const { submit, busy, feedback } = useAction(action);
  const live = data.liveAccess;
  const plan = run?.planRevisions?.at(-1);
  const review = (data.reviewDecisions ?? []).find((entry) =>
    entry.gate === "gate_1" && String(entry.runId) === run?.id && entry.planVersion === plan?.version);
  const userId = data.session?.id ?? data.session?.userId;
  const canRequest = live && !review && run?.currentStageKey === "gate_1" &&
    !["awaiting_plan_approval", "plan_approved", "plan_changes_requested"].includes(run.status) &&
    (!userId || String(run.ownerUserId) === String(userId)) &&
    rolesForClient(data.session, client?.id).some((role) => ["approver", "marketing_operator"].includes(role));
  const assignedIds = review?.selectedPlanItemIds?.map(String) ?? [];
  const items = live ? (plan?.items ?? []).map((item) => ({
    ...item, id: String(item.itemId), title: item.title ?? item.topic ?? item.angle,
    cta: item.cta ?? item.callToAction, version: plan.version,
    status: canRequest || assignedIds.includes(String(item.itemId)) ? "Awaiting approval" : "Planned",
  })) :
    run && client
      ? data.plans.filter(
          (item) => item.clientId === client.id && item.runId === run.id,
        )
      : [];
  const reviewable = items.filter(
    (item) => item.status === "Awaiting approval",
  );
  const chosen = reviewable.filter((item) => (review ? assignedIds : selected).includes(item.id));
  const reviewKey = JSON.stringify(
    chosen.map((item) => [item.id, item.version]),
  );
  const stale = Boolean(confirm && reviewed !== reviewKey);
  function confirmDecision(kind) {
    setReviewed(reviewKey);
    setConfirm(kind);
  }
  const editable = canAct("editPlanItem") && run?.canEditPlan !== false;
  const canDecide = live ? Boolean(review || canRequest) : canAct("approvePlan") && run?.canApprovePlan !== false;

  function toggle(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function decide(event) {
    event.preventDefault();
    if (stale || !chosen.length) return;
    if (live) {
      const payload = review ? {
        projectId: String(review.projectId), reviewId: review._id,
        decision: confirm === "approve" ? "approved" : "rejected", reason: reason.trim(),
      } : {
        runId: run.id, planVersion: plan.version,
        selectedPlanItemIds: chosen.map(({ id }) => id), askApprover: requiresApprover,
      };
      submit(review ? "decideReview" : "requestPlanApproval", payload, () => {
        setConfirm("");
        setReason("");
        setSelected([]);
      });
      return;
    }
    submit(
      confirm === "approve" ? "approvePlan" : "rejectPlan",
      {
        runId: run.id,
        items: chosen.map((item) => ({ id: item.id, version: item.version })),
        ...(confirm === "approve"
          ? { requiresApprover }
          : { reason: reason.trim() }),
      },
      () => {
        setConfirm("");
        setReason("");
        setSelected([]);
      },
    );
  }
  return (
    <Page
      className="review-screen"
      title="Approve content plan · Gate 1"
      description={
        run
          ? [client.name, run.period, run.status].filter(Boolean).join(" · ")
          : "Select a run to review its content plan."
      }
      actions={
        <WorkflowLink href={href("runs", run ? { run: run.id } : {})}>
          Back to run
        </WorkflowLink>
      }
    >
      {live && !confirm && feedback}
      {run && <div className="plan-review-summary" aria-label="Plan summary">
        <Card title="Posts"><strong>{items.length}</strong><span>{reviewable.length} awaiting approval</span></Card>
        <Card title="Pillar mix">
          <div className="admin-actions">
            {run.pillarCoverage?.map((item) => (
              <Chip key={item.pillar}>
                {item.pillar} · {item.actual} / {item.target}
              </Chip>
            ))}
          </div>
          {!run.pillarCoverage?.length && <span>{new Set(items.map(({ pillar }) => pillar).filter(Boolean)).size} pillars</span>}
        </Card>
        <Card title="Key dates"><strong>{items.filter(({ scheduledAt }) => scheduledAt).length}</strong><span>posts with a scheduled date</span></Card>
        <Card title="Evidence"><strong>{items.filter(({ proof }) => !proof?.length).length}</strong><span>posts without linked evidence</span></Card>
      </div>}
      <Card title="Plan items">
        <div className="admin-row">
          <Tabs
            values={["Table", "Calendar"]}
            value={view}
            onChange={setView}
          />
          {canDecide && <div className="admin-actions">
            <span className="muted">{chosen.length} selected</span>
            {(!live || review) && <Button
              disabled={!canDecide || !chosen.length || busy}
              onClick={() => confirmDecision("reject")}
            >
              Reject selected
            </Button>}
            <button
              type="button"
              className="btn gate"
              disabled={!canDecide || !chosen.length || busy}
              onClick={() => confirmDecision("approve")}
            >
              {canRequest ? "Request plan review" : "Approve " + (chosen.length || "") + " selected"}
            </button>
          </div>}
        </div>
        {view === "Table" ? (
          <Table
            headers={[
              canDecide && <input
                aria-label="Select all pending items"
                type="checkbox"
                disabled={Boolean(review) || !reviewable.length || !canDecide}
                checked={Boolean(
                  reviewable.length && chosen.length === reviewable.length,
                )}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? reviewable.map((item) => item.id)
                      : [],
                  )
                }
              />,
              "Date (IST)",
              "Pillar",
              "Topic and angle",
              "Format",
              "CTA",
              "Proof",
              "Why (agent)",
              "Status",
              "",
            ]}
            rows={items.map((item) => [
              canDecide && <input
                aria-label={"Select " + item.title}
                type="checkbox"
                checked={
                  (review ? assignedIds : selected).includes(item.id) &&
                  item.status === "Awaiting approval"
                }
                disabled={Boolean(review) || !canDecide || item.status !== "Awaiting approval"}
                onChange={() => toggle(item.id)}
              />,
              item.scheduledAt ?? "—",
              item.pillar ?? "—",
              <>
                <strong>{item.title}</strong>
                <p className="muted">{item.angle}</p>
              </>,
              item.format ?? "—",
              item.cta ?? "—",
              item.proof?.length
                ? item.proof
                    .map((value) =>
                      typeof value === "string" ? value : value.id,
                    )
                    .join(", ")
                : "—",
              item.rationale ? (
                <details>
                  <summary>Show</summary>
                  {item.rationale}
                </details>
              ) : (
                "—"
              ),
              <Chip>{item.status}</Chip>,
              editable && item.status === "Awaiting approval" && (
                <Button onClick={() => setDraft({ ...item, comment: "" })}>
                  Edit
                </Button>
              ),
            ])}
            empty="No plan items to review."
          />
        ) : items.length ? (
          <div className="admin-grid">
            {[...items]
              .sort((a, b) =>
                (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""),
              )
              .map((item) => (
                <Card key={item.id} title={item.scheduledAt ?? "Unscheduled"}>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.pillar}</p>
                  <div>
                    <Chip>{item.status}</Chip>
                  </div>
                </Card>
              ))}
          </div>
        ) : (
          <p className="muted">No items scheduled.</p>
        )}
        {feedback}
      </Card>
      {draft && (
        <ReviewDialog title="Edit plan item" onClose={() => setDraft(null)}>
          <form
            className="workflow-form"
            onSubmit={(event) => {
              event.preventDefault();
              const {
                id,
                version,
                title,
                angle,
                cta,
                comment,
                scheduledAt,
                pillar,
                format,
              } = draft;
              submit(
                "editPlanItem",
                {
                  runId: run.id,
                  id,
                  version,
                  values: {
                    title,
                    angle,
                    cta,
                    comment,
                    scheduledAt,
                    pillar,
                    format,
                  },
                },
                () => setDraft(null),
              );
            }}
          >
            {[
              ["title", "Topic"],
              ["scheduledAt", "Date and time (IST)"],
              ["pillar", "Pillar"],
              ["angle", "Angle"],
              ["format", "Format"],
              ["cta", "CTA"],
              ["comment", "Comment"],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="text"
                  required={key === "title"}
                  value={draft[key] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </Field>
            ))}
            {feedback}
            <div className="admin-actions">
              <Button primary type="submit" disabled={busy}>
                Save changes
              </Button>
              <Button onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        </ReviewDialog>
      )}
      {confirm && (
        <ReviewDialog
          title={
            canRequest ? "Request plan review?" : confirm === "approve"
              ? "Approve " + chosen.length + " plan items?"
              : "Reject " + chosen.length + " plan items?"
          }
          onClose={() => setConfirm("")}
        >
          <form className="workflow-form" onSubmit={decide}>
            {stale && (
              <p role="alert">
                The selected plan items changed. Cancel and review the current
                versions.
              </p>
            )}
            <ul>
              {chosen.map((item) => (
                <li key={item.id}>
                  {item.title} · {item.version ?? "—"}
                </li>
              ))}
            </ul>
            {confirm === "approve" ? ((!live || canRequest) && (
              <label>
                <input
                  type="checkbox"
                  checked={requiresApprover}
                  onChange={(event) =>
                    setRequiresApprover(event.target.checked)
                  }
                />{" "}
                Ask Approver to review
              </label>
            )) : (
              <Field label="Reason">
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            )}
            {feedback}
            <div className="admin-actions">
              <Button
                className="btn gate"
                type="submit"
                disabled={
                  busy ||
                  stale ||
                  !chosen.length ||
                  (confirm === "reject" && !reason.trim())
                }
              >
                {canRequest ? "Request review" : (confirm === "approve" ? "Approve " : "Reject ") + chosen.length + " items"}
              </Button>
              <Button onClick={() => setConfirm("")}>Cancel</Button>
            </div>
          </form>
        </ReviewDialog>
      )}
    </Page>
  );
}
