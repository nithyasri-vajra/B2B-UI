import { useRef, useState } from "react";
import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";
import { canStartRun, configuredAgent } from "./OperatorHome";
import periodBriefTemplate from "./period-brief-template.xlsx?url";

export default function NewRun({ data, client, run, href, navigate, action, preview }) {
  const agent = configuredAgent(data, run ? run.agentId : client?.agentId);
  const templateUrl = agent?.briefTemplateUrl ?? data.integrations.briefTemplateUrl ?? periodBriefTemplate;
  const input = useRef(null);
  const [briefId, setBriefId] = useState(() => preview && !run
    ? data.briefs.findLast((brief) => brief.clientId === client?.id && brief.validated)?.id ?? null
    : null);
  const [fileName, setFileName] = useState(() => data.briefs.find((brief) => brief.id === briefId)?.name ?? "");
  const [fileError, setFileError] = useState("");
  const [openFeedback, setOpenFeedback] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const result = useRef(null);
  const { submit, busy, feedback } = useAction(async (name, payload) => {
    try {
      result.current = await action(name, payload);
      return result.current;
    } catch (error) {
      if (name !== "validateBrief") throw error;
      setFileError(error.message === "Connect this action to the app service before using it."
        ? "Excel validation isn’t connected in this preview."
        : error.message || "The brief could not be validated.");
      return false;
    }
  });
  const readiness = data.readiness.find((item) => item.clientId === client?.id);
  const brief = data.briefs.find(
    (item) => item.clientId === client?.id && item.id === briefId,
  );
  const blocked = !canStartRun(readiness);
  const issues = brief?.issues ?? [];
  const ready =
    brief?.validated === true &&
    !issues.some((issue) => issue.severity === "Error");
  const currentStep = ready && !blocked ? 2 : fileName ? 1 : 0;

  function pick(file) {
    if (!file || busy || !client) return;
    setFileError("");
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setFileError("Choose one .xlsx file no larger than 5 MB.");
      return;
    }
    setBriefId(null);
    setFileName(file.name);
    submit("validateBrief", { file, runId: run?.id }, () => {
      const received =
        result.current?.briefId ?? result.current?.data?.briefs?.[0]?.id;
      if (received) setBriefId(received);
      else setFileError("Validation finished without a brief reference.");
    });
  }

  function save(name) {
    const payload = { briefId, runId: run?.id };
    if (agent && name !== "replaceBrief") payload.agentId = agent.id;
    if (preview && name === "startRun" && openFeedback.trim())
      payload.openFeedback = openFeedback.trim();
    submit(name, payload, () => {
      const id =
        result.current?.runId ?? result.current?.data?.runs?.[0]?.id ?? run?.id;
      if (id) navigate("runs", { run: id });
    });
  }

  return (
    <Page
      className="workflow-setup-page"
      title={run ? "Replace period brief" : agent?.name ?? "New agent run"}
      actions={
        <a className="btn" href={templateUrl} download={templateUrl === periodBriefTemplate ? "period-brief-template.xlsx" : true}>
          Download period brief template (.xlsx)
        </a>
      }
    >
      <ol className="new-run-steps" aria-label="Run setup steps">
        {["Attach brief", "Check", "Run"].map((label, index) => (
          <li
            key={label}
            className="step"
            aria-current={index === currentStep ? "step" : undefined}
            data-reached={index <= currentStep}
          >
            <span className="dot" aria-hidden="true">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="new-run-layout">
        <div className="new-run-setup">
          <Card title="1 · Period brief (session context)">
            <button
              className="ph workflow-drop"
              type="button"
              disabled={!client || busy}
              onClick={() => input.current.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.files.length === 1)
                  pick(event.dataTransfer.files[0]);
                else setFileError("Choose one Excel brief.");
              }}
            >
              Drop one Excel brief here or browse · .xlsx, up to 5 MB
            </button>
            <input
              ref={input}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(event) => {
                pick(event.currentTarget.files[0]);
                event.currentTarget.value = "";
              }}
            />
            {fileName && (
              <div className="admin-row">
                <strong>{fileName}</strong>
                <div className="admin-actions">
                  <Button disabled={busy} onClick={() => input.current.click()}>
                    Replace
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setBriefId(null);
                      setFileName("");
                      setFileError("");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <Card title="Validation">
            {fileError && <p role="alert">{fileError}</p>}
            {issues.length ? (
              issues.map((issue, i) => (
                <div key={i}>
                  <Chip tone={issue.severity === "Error" ? "r" : "a"}>
                    {issue.severity}
                  </Chip>{" "}
                  {issue.location && issue.location + " · "}
                  {issue.message}
                </div>
              ))
            ) : (
              <p className="new-run-validation-status" role="status">
                {ready
                  ? "Brief passed validation."
                  : busy
                    ? "Checking brief…"
                    : fileName
                      ? "Brief validation is required before you can start."
                      : "Upload an Excel brief to check it."}
              </p>
            )}
            {preview && !run && (
              <label className="admin-field new-run-validation-feedback">
                <span>Period feedback <span className="muted">(optional)</span></span>
                <textarea
                  value={openFeedback}
                  onChange={(event) => setOpenFeedback(event.target.value)}
                  placeholder="Add open feedback or enter No open feedback if confirmed."
                  maxLength={4000}
                  rows={2}
                />
              </label>
            )}
            {blocked && (
              <div className="new-run-validation-readiness">
                <strong>Readiness check required</strong>
                <p>
                {readiness?.reason ??
                  "Complete the readiness check before running the agent."}
                </p>
                <a href={href("readiness")}>Open readiness</a>
              </div>
            )}
            {readiness?.limitations?.map((item) => (
              <p key={item} className="muted">
                {item}
              </p>
            ))}
            {run ? (
              <>
                <Button
                  primary
                  disabled={!ready || busy || preview}
                  onClick={() => setConfirmReplace(true)}
                >
                  Replace and restart
                </Button>
                {confirmReplace && (
                  <div className="card workflow-notice">
                    <p>
                      Replacing this brief invalidates existing approvals and
                      restarts brief qualification.
                    </p>
                    <div className="admin-actions">
                      <Button
                        primary
                        disabled={busy}
                        onClick={() => save("replaceBrief")}
                      >
                        Confirm replacement
                      </Button>
                      <Button onClick={() => setConfirmReplace(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="new-run-validation-actions">
                <Button
                  disabled={!ready || busy || preview}
                  onClick={() => save("saveRunDraft")}
                >
                  Save as draft
                </Button>
                <Button
                  primary
                  disabled={blocked || !ready || busy}
                  onClick={() => save("startRun")}
                >
                  {agent?.name ? "Run " + agent.name : "Run agent"}
                </Button>
              </div>
            )}
            {preview && ready && <p className="muted">This preview runs Context Assembler and Brief Qualifier.</p>}
            {busy && ready && <p role="status">Running the skills. Keep this page open.</p>}
            {feedback}
          </Card>
        </div>
        <Card title="What we read from the brief">
          <div
            className="new-run-brief-details"
            role="region"
            aria-label="Brief details table"
            tabIndex={0}
          >
            <Table
              headers={["Field", "Value"]}
              rows={Object.entries(brief?.fields ?? {}).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(", ") : String(value ?? "-"),
              ])}
              empty="No brief details to display."
            />
          </div>
        </Card>
      </div>
    </Page>
  );
}
