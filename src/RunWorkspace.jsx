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
import { pipeline, WorkflowLink } from "./OperatorHome";

export default function RunWorkspace({ data, client, run, href, action }) {
  const [tab, setTab] = useState("Activity");
  const [answer, setAnswer] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const { submit, busy, feedback } = useAction(action);
  const runs = client
    ? data.runs.filter((item) => item.clientId === client.id)
    : [];
  if (!run)
    return (
      <Page
        title="Runs"
        description={client?.name}
        actions={
          <WorkflowLink href={href("new-run")} primary>
            New run
          </WorkflowLink>
        }
      >
        <Card>
          <Table
            headers={["Run", "Period", "Status", "Owner", ""]}
            rows={runs.map((item) => [
              item.name ?? item.id,
              item.period ?? "—",
              <Chip>{item.status}</Chip>,
              item.owner ?? "—",
              <a href={href("runs", { run: item.id })}>Open run</a>,
            ])}
            empty="No runs yet."
          />
        </Card>
      </Page>
    );
  const posts = data.posts.filter(
    (item) => item.clientId === client.id && item.runId === run.id,
  );
  const brief = data.briefs.find(
    (item) => item.clientId === client.id && item.id === run.briefId,
  );
  const questions = run.questions ?? [];
  const canChange = !["Completed", "Cancelled", "Failed"].includes(run.status);
  const selectedQuestion = questions.find(
    (item) => item.id === questionId && !item.answer,
  );
  const firstReview = posts.find((item) => item.status === "Awaiting approval");
  function change(name, payload) {
    return submit(name, { runId: run.id, ...payload });
  }

  return (
    <Page
      title={run.name ?? "LinkedIn · " + (run.period ?? run.id)}
      description={[run.owner, run.startedAt].filter(Boolean).join(" · ")}
      actions={
        <>
          <Chip tone="b">{run.status}</Chip>
          {canChange && (
            <>
              <WorkflowLink href={href("new-run", { run: run.id })}>
                Replace brief
              </WorkflowLink>
              <Button onClick={() => setCancel(true)}>Cancel run</Button>
            </>
          )}
        </>
      }
    >
      <a href={href("runs")}>All runs</a>
      <div className="workflow-stages" aria-label="Run stages">
        {pipeline.map((name, i) => {
          const stage =
            run.stages?.find((item) => item.name === name) ?? run.stages?.[i];
          return (
            <div className="st" key={name}>
              <strong>{name}</strong>
              <Chip
                tone={
                  stage?.status === "Done"
                    ? "g"
                    : stage?.status === "Blocked"
                      ? "r"
                      : undefined
                }
              >
                {stage?.status ?? "Pending"}
              </Chip>
              {stage?.duration && <span>{stage.duration}</span>}
            </div>
          );
        })}
      </div>
      {run.blocker && (
        <section className="card admin-card workflow-notice" role="status">
          <h2>{run.blocker.title ?? "Run blocked"}</h2>
          <p>{run.blocker.reason}</p>
          {run.blocker.owner && (
            <p className="muted">Owner · {run.blocker.owner}</p>
          )}
          <div className="admin-actions">
            {run.blocker.actions?.includes("askKnowledgeAdmin") && (
              <Button
                disabled={busy}
                onClick={() => change("askKnowledgeAdmin")}
              >
                Ask Knowledge Admin
              </Button>
            )}
            {run.blocker.actions?.includes("rewriteWithoutClaim") && (
              <Button
                disabled={busy}
                onClick={() => change("rewriteWithoutClaim")}
              >
                Rewrite without claim
              </Button>
            )}
            {questions.some((item) => !item.answer) && (
              <Button onClick={() => setTab("Questions")}>
                Answer questions
              </Button>
            )}
          </div>
        </section>
      )}
      {cancel && (
        <Card title="Cancel this run?">
          <form
            className="workflow-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit(
                "cancelRun",
                { runId: run.id, reason: reason.trim() },
                () => setCancel(false),
              );
            }}
          >
            <Field label="Reason">
              <textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <div className="admin-actions">
              <Button primary type="submit" disabled={busy || !reason.trim()}>
                Confirm cancellation
              </Button>
              <Button onClick={() => setCancel(false)}>Keep run</Button>
            </div>
          </form>
        </Card>
      )}
      {feedback}
      <div className="workflow-columns">
        <section className="card admin-card workflow-primary">
          <div className="admin-row">
            <h2>Posts in this run</h2>
            <div className="admin-actions">
              {run.status === "Awaiting Gate 1" && (
                <WorkflowLink href={href("plan", { run: run.id })} gate>
                  Review plan
                </WorkflowLink>
              )}
              {firstReview && (
                <WorkflowLink
                  href={href("post", { run: run.id, post: firstReview.id })}
                  gate
                >
                  Review{" "}
                  {
                    posts.filter((item) => item.status === "Awaiting approval")
                      .length
                  }{" "}
                  posts
                </WorkflowLink>
              )}
            </div>
          </div>
          <Table
            headers={["Post", "Pillar", "Scheduled", "Status"]}
            rows={posts.map((item) => [
              <a href={href("post", { run: run.id, post: item.id })}>
                {item.title}
              </a>,
              item.pillar ?? "—",
              item.scheduledAt ?? "—",
              <Chip>{item.status}</Chip>,
            ])}
            empty="Posts will appear here when the agent produces them."
          />
        </section>
        <Card>
          <Tabs
            values={["Activity", "Brief", "Context", "Questions"]}
            value={tab}
            onChange={setTab}
          />
          {tab === "Activity" &&
            (run.activity?.length ? (
              run.activity.map((item, i) => (
                <p key={item.id ?? i}>
                  {item.title ?? item.message}{" "}
                  <span className="muted">{item.at ?? ""}</span>
                </p>
              ))
            ) : (
              <p className="muted">No activity yet.</p>
            ))}
          {tab === "Brief" &&
            (brief ? (
              <p>
                {brief.name ?? brief.period ?? brief.id}{" "}
                {brief.downloadUrl && (
                  <a href={brief.downloadUrl} download>
                    Download brief
                  </a>
                )}
              </p>
            ) : (
              <p className="muted">No brief attached.</p>
            ))}
          {tab === "Context" && (
            <Table
              headers={["Record", "Version"]}
              rows={(run.context ?? []).map((item) => [
                item.id,
                item.version ?? "—",
              ])}
              empty="No context records recorded."
            />
          )}
          {tab === "Questions" &&
            (questions.length ? (
              questions.map((item) => (
                <div key={item.id}>
                  <strong>{item.prompt}</strong>
                  {item.answer ? (
                    <p>{item.answer}</p>
                  ) : (
                    <Button
                      onClick={() => {
                        setQuestionId(item.id);
                        setAnswer("");
                      }}
                    >
                      Answer
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">No questions.</p>
            ))}
          {tab === "Questions" && selectedQuestion && (
            <form
              className="workflow-form"
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  "answerRunQuestion",
                  { runId: run.id, id: questionId, answer: answer.trim() },
                  () => {
                    setQuestionId("");
                    setAnswer("");
                  },
                );
              }}
            >
              <Field label="Your answer">
                <textarea
                  value={answer}
                  required
                  onChange={(event) => setAnswer(event.target.value)}
                />
              </Field>
              <Button primary type="submit" disabled={busy || !answer.trim()}>
                Send answer
              </Button>
            </form>
          )}
        </Card>
      </div>
    </Page>
  );
}
