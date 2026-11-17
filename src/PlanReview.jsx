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

export default function PlanReview({ data, client, run, href, action }) {
  const [view, setView] = useState("Table");
  const [selected, setSelected] = useState([]);
  const [requiresApprover, setRequiresApprover] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [reviewed, setReviewed] = useState("");
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState(null);
  const { submit, busy, feedback } = useAction(action);
  const items =
    run && client
      ? data.plans.filter(
          (item) => item.clientId === client.id && item.runId === run.id,
        )
      : [];
  const reviewable = items.filter(
    (item) => item.status === "Awaiting approval",
  );
  const chosen = reviewable.filter((item) => selected.includes(item.id));
  const reviewKey = JSON.stringify(
    chosen.map((item) => [item.id, item.version]),
  );
  const stale = Boolean(confirm && reviewed !== reviewKey);
  function confirmDecision(kind) {
    setReviewed(reviewKey);
    setConfirm(kind);
  }
  const editable = run?.canEditPlan !== false;
  const canDecide = run?.canApprovePlan !== false;

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
      title="Gate 1 · Approve content plan"
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
      {run?.pillarCoverage?.length > 0 && (
        <Card title="Coverage">
          <div className="admin-actions">
            {run.pillarCoverage.map((item) => (
              <Chip key={item.pillar}>
                {item.pillar} · {item.actual} / {item.target}
              </Chip>
            ))}
          </div>
        </Card>
      )}
      <Card title="Plan items">
        <div className="admin-row">
          <Tabs
            values={["Table", "Calendar"]}
            value={view}
            onChange={setView}
          />
          <div className="admin-actions">
            <span className="muted">{chosen.length} selected</span>
            <Button
              disabled={!canDecide || !chosen.length || busy}
              onClick={() => confirmDecision("reject")}
            >
              Reject selected
            </Button>
            <button
              type="button"
              className="btn gate"
              disabled={!canDecide || !chosen.length || busy}
              onClick={() => confirmDecision("approve")}
            >
              Approve {chosen.length || ""} selected
            </button>
          </div>
        </div>
        {view === "Table" ? (
          <Table
            headers={[
              <input
                aria-label="Select all pending items"
                type="checkbox"
                disabled={!reviewable.length || !canDecide}
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
              <input
                aria-label={"Select " + item.title}
                type="checkbox"
                checked={
                  selected.includes(item.id) &&
                  item.status === "Awaiting approval"
                }
                disabled={!canDecide || item.status !== "Awaiting approval"}
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
            confirm === "approve"
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
            {confirm === "approve" ? (
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
            ) : (
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
                {confirm === "approve" ? "Approve " : "Reject "}
                {chosen.length} items
              </Button>
              <Button onClick={() => setConfirm("")}>Cancel</Button>
            </div>
          </form>
        </ReviewDialog>
      )}
    </Page>
  );
}
