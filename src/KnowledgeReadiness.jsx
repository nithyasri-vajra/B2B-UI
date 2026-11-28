import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";
import "./knowledge-readiness.css";

const verdictTone = { READY: "g", LIMITED: "a", BLOCKED: "r" };
const shortDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const asDate = (value) => value && Number.isFinite(Date.parse(value)) ? shortDate.format(new Date(value)) : "—";

// Live brands: our Knowledge overview. Verdicts are READY / LIMITED / BLOCKED from the backend; no 0-100 score.
function LiveKnowledgeOverview({ link, action, client, data, readOnly }) {
  const report = data.readiness.find((item) => item.clientId === client?.id);
  const { submit, busy, feedback } = useAction(action);
  const sources = link("KnowledgeSetup.dc.html").href;
  const recordsHref = link("RecordReview.dc.html").href;
  const records = (data.records ?? []).filter((record) => record.clientId === client?.id);
  const approved = records.filter(({ state }) => /approved/i.test(state ?? "")).length;
  const waiting = records.filter(({ state }) => /pending|draft|review/i.test(state ?? "")).length;
  const uploads = (data.uploads ?? []).filter((row) => row.clientId === client?.id);
  const versions = (data.projectKnowledgeVersions ?? []).filter((row) => row.clientId === client?.id)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const agents = Object.entries(report?.perAgent ?? {});
  const names = new Map((data.projects ?? []).filter(({ clientId }) => clientId === client?.id)
    .flatMap(({ agents: list = [] }) => list.map(({ agentKey, name }) => [agentKey, name])));
  const now = Date.now();
  const due = records.filter((record) => Date.parse(record.reviewBy) <= now + 7 * 86400000)
    .sort((a, b) => Date.parse(a.reviewBy) - Date.parse(b.reviewBy));
  return (
    <Page className="knowledge-readiness" title="Knowledge"
      description={client ? "Approved brand knowledge for " + client.name + "." : "Select a brand to view its knowledge."}>
      {feedback}
      {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
      <nav className="knowledge-readiness-tabs" aria-label="Knowledge sections">
        <span aria-current="page">Overview</span>
        {sources && <a href={sources}>Sources</a>}
        {recordsHref && <a href={recordsHref}>Records</a>}
      </nav>
      <div className="our-g2">
        <section className="card">
          <div className="our-between"><h2>Published knowledge</h2>
            <Chip tone={client?.knowledgeVersion != null ? "g" : "r"}>{client?.knowledgeVersion != null ? "Version " + client.knowledgeVersion : "Not published"}</Chip></div>
          <p>Every run uses the version that was published when it started, so later edits never change a run in progress.</p>
          <p className="muted">{approved} approved record{approved === 1 ? "" : "s"}{waiting ? " · " + waiting + " waiting for review" : ""} · {uploads.length} source{uploads.length === 1 ? "" : "s"}</p>
          {!readOnly && <div><Button primary disabled={!client || busy} onClick={() => submit("publishKnowledge")}>
            Publish version {(client?.knowledgeVersion ?? 0) + 1}</Button></div>}
        </section>
        <section className="card">
          <div className="our-between"><h2>Pre-run checks</h2>
            {report && <Chip tone={verdictTone[report.verdict]}>{report.verdict}</Chip>}</div>
          {!report && <p className="muted">No readiness check yet.</p>}
          {report?.reason && <p>{report.reason}</p>}
          {agents.map(([key, value]) => (
            <div key={key} className="our-between our-top our-line">
              <div><p className="our-strong">{names.get(key) ?? key}</p>{value.reason && <p className="muted">{value.reason}</p>}</div>
              <Chip tone={verdictTone[value.verdict]}>{value.verdict}</Chip>
            </div>
          ))}
          <p className="muted">The agents give their own READY, LIMITED or BLOCKED verdict for each stage when a run starts.</p>
        </section>
      </div>
      <section className="card our-flush">
        <div className="our-pad"><h2>Version history</h2></div>
        <div className="admin-table"><table>
          <thead><tr><th>Version</th><th>Published</th><th>Records</th></tr></thead>
          <tbody>
            {versions.map((row) => <tr key={row.version + ":" + row.projectId}><td>v{row.version}</td><td>{asDate(row.publishedAt ?? row.createdAt)}</td><td>{row.recordRevisions?.length ?? "—"}</td></tr>)}
            {!versions.length && <tr><td colSpan={3} className="muted">No versions yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
      {recordsHref && <Card title="Due for review">
        {due.length ? due.map((record) => (
          <div key={record.id} className="our-between"><span>{record.title ?? record.id}</span><span className="muted">{asDate(record.reviewBy)}</span></div>
        )) : <p className="muted">No records due within the next seven days.</p>}
        <a href={recordsHref}>Open records</a>
      </Card>}
    </Page>
  );
}

export default function KnowledgeReadiness(props) {
  return props.data.liveAccess ? <LiveKnowledgeOverview {...props} /> : <PreviewKnowledgeReadiness {...props} />;
}

function PreviewKnowledgeReadiness({ link, action, client, data, readOnly, onPublished }) {
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
