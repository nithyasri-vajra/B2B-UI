import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";

export default function KnowledgeReadiness({ link, action, client, data }) {
  const report = data.readiness.find((item) => item.clientId === client?.id);
  const { submit, busy, feedback } = useAction(action);
  const tone = { Green: "g", Amber: "a", Red: "r" }[report?.band];
  const percent = (value) => (value == null ? "—" : value + "%");

  return (
    <Page
      title={"Knowledge readiness" + (client ? " · " + client.name : "")}
      actions={
        <>
          <Button
            disabled={!client || busy}
            onClick={() => submit("recalculateReadiness")}
          >
            Recalculate
          </Button>
          <a className="btn" {...link("RecordReview.dc.html")}>
            Open records
          </a>
          <Button
            primary
            disabled={!report?.canPublish || busy}
            onClick={() => submit("publishKnowledge")}
          >
            Publish knowledge
          </Button>
        </>
      }
    >
      {feedback}
      <div className="admin-grid">
        <Card title="Knowledge Readiness Score">
          {report ? (
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
        <Card title="Hard gates">
          <Table
            headers={["Gate", "Status", ""]}
            rows={(report?.gates ?? []).map((gate) => [
              gate.name,
              <Chip tone={gate.passed ? "g" : "r"}>
                {gate.passed ? "Pass" : "Fail"}
              </Chip>,
              !gate.passed && <a {...link("KnowledgeSetup.dc.html")}>Fix</a>,
            ])}
            empty="No hard gate results yet."
          />
        </Card>
      </div>
      <div className="admin-grid">
        <Card title="Score by domain">
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
        </Card>
        <Card title="Gaps to close">
          <Button
            disabled={!report?.gaps?.length || busy}
            onClick={() => submit("draftClientQuestions")}
          >
            Draft client questions
          </Button>
          <Table
            headers={["Item", "Why it matters", "Owner", "Due date", "Action"]}
            rows={(report?.gaps ?? []).map((gap) => [
              gap.name,
              gap.reason ?? "—",
              gap.owner ?? "—",
              gap.dueAt ?? "—",
              <div className="admin-actions">
                <a {...link("KnowledgeSetup.dc.html")}>Upload</a>
                <Button
                  disabled={busy}
                  onClick={() => submit("askClient", { id: gap.id })}
                >
                  Ask client
                </Button>
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
