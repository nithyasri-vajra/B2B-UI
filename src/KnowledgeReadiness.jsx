import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";

export default function KnowledgeReadiness({ link, action, client, data, readOnly, onPublished }) {
  const report = data.readiness.find((item) => item.clientId === client?.id);
  const { submit, busy, feedback } = useAction(action);
  const tone = { Green: "g", Amber: "a", Red: "r" }[report?.band];
  const percent = (value) => (value == null ? "—" : value + "%");

  return (
    <Page
      title={"Knowledge readiness" + (client ? " · " + client.name : "")}
      actions={!readOnly && (
        <>
          {!report?.preview && <Button
            disabled={!client || busy}
            onClick={() => submit("recalculateReadiness")}
          >
            Recalculate
          </Button>}
          <a className="btn" {...link("RecordReview.dc.html")}>
            Open records
          </a>
          <Button
            primary
            disabled={!report?.canPublish || busy}
            onClick={() => submit("publishKnowledge", undefined, onPublished)}
          >
            Publish knowledge
          </Button>
        </>
      )}
    >
      {feedback}
      {client?.knowledge && <p>Active version · {client.knowledge}</p>}
      <div className="admin-grid">
        <Card title={report?.preview ? "File approvals" : "Knowledge Readiness Score"}>
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
              <strong>{report.score ?? "—"} / 100</strong>
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
      <div className="admin-grid">
        {!report?.preview && <Card title="Score by domain">
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
