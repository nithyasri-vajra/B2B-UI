import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";
import "./knowledge-readiness.css";

export default function KnowledgeReadiness({ link, action, client, data, readOnly, onPublished }) {
  const report = data.readiness.find((item) => item.clientId === client?.id);
  const { submit, busy, feedback } = useAction(action);
  const tone = { Green: "g", Amber: "a", Red: "r" }[report?.band];
  const percent = (value) => (value == null ? "—" : value + "%");
  const sources = link("KnowledgeSetup.dc.html").href;
  const records = link("RecordReview.dc.html").href;
  const agent = data.agents?.find(({ id }) => id === client?.agentId);
  const now = Date.now();
  const due = records && client ? (data.records ?? [])
    .filter((record) => record.clientId === client.id && Date.parse(record.reviewBy) <= now + 7 * 86400000)
    .sort((a, b) => Date.parse(a.reviewBy) - Date.parse(b.reviewBy)) : [];

  return (
    <Page
      className="knowledge-readiness"
      title="Knowledge"
      description={client ? `Approved brand knowledge for ${client.name}.` : "Select a brand to view its knowledge."}
      actions={!readOnly && (
        <>
          {!data.liveAccess && !report?.preview && <Button
            disabled={!client || busy}
            onClick={() => submit("recalculateReadiness")}
          >
            Recalculate
          </Button>}
          {records && <a className="btn" href={records}>
            Open records
          </a>}
        </>
      )}
    >
      {feedback}
      {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
      <nav className="knowledge-readiness-tabs" aria-label="Knowledge sections">
        <span aria-current="page">Readiness</span>
        {sources && <a href={sources}>Sources</a>}
        {records && <a href={records}>Records</a>}
      </nav>
      <div className="knowledge-readiness-top">
        <Card title={report?.preview ? "File approvals" : "Shared brand knowledge"}>
          {report?.preview ? (
            <>
              <strong>{report.files.filter(({ approved }) => approved).length} of {report.files.length} approved</strong>
              <p>{report.canStart ? "Ready to start a new run." : report.canPublish ? "Publish knowledge to enable Start new run." : "Review the remaining files to enable publishing."}</p>
              <Table
                headers={["File", "Status"]}
                rows={report.files.map(({ name, status, approved }) => [
                  name,
                  <Chip tone={approved ? "g" : undefined}>{status}</Chip>,
                ])}
              />
            </>
          ) : report ? (
            <>
              <strong className="knowledge-score">{report.score ?? "-"} <small>/ 100</small></strong>
              <p>
                <Chip tone={tone}>{report.band ?? "Pending"}</Chip>
              </p>
              <p>
                Coverage {percent(report.coverage)} · Verified{" "}
                {percent(report.verified)}
              </p>
            </>
          ) : (
            <p className="muted">No readiness assessment yet.</p>
          )}
          {(client?.knowledge ?? client?.knowledgeVersion) != null && <p className="muted">Active version · {client.knowledge ?? client.knowledgeVersion}</p>}
          {!readOnly && <Button primary disabled={!client || (!data.liveAccess && !report?.canPublish) || busy}
            onClick={() => submit("publishKnowledge", undefined, data.liveAccess ? undefined : onPublished)}>
            Publish knowledge
          </Button>}
        </Card>
        {!report?.preview && <Card title="Hard gates">
          <Table
            headers={["Gate", "Status", ""]}
            rows={(report?.gates ?? []).map((gate) => [
              gate.name,
              <Chip tone={gate.passed ? "g" : "r"}>
                {gate.passed ? "Pass" : "Fail"}
              </Chip>,
              !readOnly && !gate.passed && <a {...link("KnowledgeSetup.dc.html")}>Fix</a>,
            ])}
            empty="No hard gate results yet."
          />
        </Card>}
      </div>
      {!report?.preview && <Card title="Readiness by agent">
        <Table headers={["Agent", "Shared", "Agent-specific", "Status", "Still needed"]}
          rows={agent ? [[agent.name ?? agent.id, report?.score ?? "-", "-", agent.enabled === false ? "Not enabled" : "Not assessed", "-"]] : []}
          empty="No configured agent to display."
        />
      </Card>}
      <div className="admin-grid">
        {!report?.preview && <Card title="By area">
          <Table
            headers={["Domain", "Weight", "Score"]}
            rows={(report?.domains ?? []).map((item) => [
              item.name ?? item.id,
              item.weight ?? "—",
              item.score == null ? (
                "—"
              ) : (
                <>
                  <progress value={item.score} max={100} /> {item.score}
                </>
              ),
            ])}
            empty="No domain scores yet."
          />
        </Card>}
        {records && <Card title="Due for review">
          <Table headers={["Record", "Review by"]}
            rows={due.map((record) => [record.title ?? record.name ?? record.id, record.reviewBy])}
            empty="No records due within the next seven days."
          />
          <a href={records}>Open records</a>
        </Card>}
      </div>
      <div>
        <Card title="Gaps to close">
          {!readOnly && !report?.preview && <Button
            disabled={!report?.gaps?.length || report.preview || busy}
            onClick={() => submit("draftClientQuestions")}
          >
            Draft client questions
          </Button>}
          <Table
            headers={["Item", "Why it matters", "Owner", "Due date", "Action"]}
            rows={(report?.gaps ?? []).map((gap) => [
              gap.name,
              gap.reason ?? "—",
              gap.owner ?? "—",
              gap.dueAt ?? "—",
              !readOnly && <div className="admin-actions">
                <a {...link(gap.reason?.startsWith("Approve this file") ? "RecordReview.dc.html" : "KnowledgeSetup.dc.html")}>Fix</a>
                {!report.preview && <Button disabled={busy} onClick={() => submit("askClient", { id: gap.id })}>Ask client</Button>}
                {gap.allowNotApplicable && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason this item is not applicable",
                      );
                      if (reason?.trim())
                        submit("markGapNotApplicable", {
                          id: gap.id,
                          reason: reason.trim(),
                        });
                    }}
                  >
                    Not applicable
                  </Button>
                )}
              </div>,
            ])}
            empty="No gaps recorded."
          />
        </Card>
      </div>
    </Page>
  );
}
