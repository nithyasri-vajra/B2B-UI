import { useRef, useState } from "react";
import { Button, Card, Chip, Field, Page, Table, useAction } from "./AdminControls";
import { canStartRun, configuredAgent } from "./OperatorHome";
import "./run-flow.css";
import { validateBrief } from "./validateBrief";
import periodBriefTemplate from "./Period Brief Template - LinkedIn.xlsx?url";

export default function NewRun({ data, client, run, href, navigate, action, preview, canAct }) {
  const agent = configuredAgent(data, run ? run.agentId : client?.agentId);
  const templateUrl = agent?.briefTemplateUrl ?? data.integrations.briefTemplateUrl ?? periodBriefTemplate;
  const live = data.liveAccess;
  const projects = data.projects.filter((project) => project.clientId === client?.id && project.status === "active");
  const [projectId, setProjectId] = useState(run?.projectId ?? "");
  const project = projects.find(({ id }) => id === projectId) ?? projects[0];
  const [checkedBrief, setCheckedBrief] = useState(null);
  const [checking, setChecking] = useState(false);
  const [savedBrief, setSavedBrief] = useState(null);
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
  const existing = live && run ? data.briefs.find(({ id }) => id === run.briefId) : null;
  const revision = existing?.versions?.find(({ version }) => version === run.briefVersion);
  const brief = live ? (run ? { fields: revision?.excelFields ?? {}, validated: Boolean(revision) } : checkedBrief) : data.briefs.find(
    (item) => item.clientId === client?.id && item.id === briefId,
  );
  const blocked = live ? !project || !canAct("startRun") || Boolean(readiness && !canStartRun(readiness)) : !canStartRun(readiness);
  const issues = brief?.issues ?? [];
  const ready =
    brief?.validated === true &&
    !issues.some((issue) => issue.severity === "Error");
  const currentStep = fileName ? 2 : 1;

  async function pick(file) {
    if (!file || busy || checking || !client) return;
    setFileError("");
    setCheckedBrief(null);
    setSavedBrief(null);
    setBriefId(null);
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setFileError("Choose one .xlsx file no larger than 5 MB.");
      return;
    }
    setBriefId(null);
    setFileName(file.name);
    if (live) {
      setChecking(true);
      try {
        setCheckedBrief(await validateBrief(file, client, { requireKpi: true }));
      } finally {
        setChecking(false);
      }
      return;
    }
    submit("validateBrief", { file, runId: run?.id }, () => {
      const received =
        result.current?.briefId ?? result.current?.data?.briefs?.[0]?.id;
      if (received) setBriefId(received);
      else setFileError("Validation finished without a brief reference.");
    });
  }

  async function save(name) {
    if (live) {
      const field = (...aliases) => String(Object.entries(brief.fields).find(
        ([label]) => aliases.includes(label.trim().toLowerCase()),
      )?.[1] ?? "");
      let saved = savedBrief;
      if (!saved) {
        const ok = await submit("saveBrief", { projectId: project.id, values: {
          title: field("brief title", "title") || fileName.replace(/\.xlsx$/i, ""),
          period: brief.period, objective: field("primary objective", "objective"),
          audience: field("target audience", "audience"), deliverables: brief.postCount,
          kpi: String(brief.primaryKpi ?? ""), excelFields: brief.fields,
        } }, () => { saved = result.current?.data?.briefs?.[0]; setSavedBrief(saved); });
        if (ok === false || !saved) return;
      }
      if (name === "startRun")
        await submit("startRun", { projectId: project.id, briefId: saved.id, currentVersion: saved.currentVersion },
          () => navigate("runs", { run: result.current.runId }));
      return;
    }
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
      className="workflow-setup-page new-run-screen"
      title={run ? live ? "Run brief" : "Replace period brief" : "New run"}
      description={run && live ? existing?.title : "Choose an agent, attach its brief and run."}
    >
      {data.workflowLoadError && <p role="alert">{data.workflowLoadError}</p>}
      {href("runs") && <a href={href("runs")}>← Runs</a>}
      {!(run && live) && <ol className="new-run-steps" aria-label="Run setup steps">
        {["Choose agent", "Attach brief", "Check and run"].map((label, index) => (
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
      </ol>}
      <Card title="Agent">
        {live && projects.length > 1 && <Field label="Project">
          <select value={project?.id} disabled={busy || checking} onChange={(event) => {
            setProjectId(event.target.value);
            setSavedBrief(null);
          }}>
            {projects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>}
        <div className="new-run-agent">
          <strong>{agent?.name ?? "Agent workflow"}</strong>
          {agent?.description && <p>{agent.description}</p>}
          <Chip tone={blocked ? "a" : "g"}>{blocked ? "Readiness check required" : "Ready"}</Chip>
        </div>
      </Card>
      <div className="new-run-layout">
        <div className="new-run-setup">
          {!(run && live) && <Card title={agent?.name ? "Brief · " + agent.name : "Period brief"}>
            <a href={templateUrl} download={templateUrl === periodBriefTemplate ? "period-brief-template.xlsx" : true}>
              Download brief template (.xlsx)
            </a>
            <button
              className="ph workflow-drop"
              type="button"
              disabled={!client || busy || checking || (live && !canAct("saveBrief"))}
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
                  <Button disabled={busy || checking} onClick={() => input.current.click()}>
                    Replace
                  </Button>
                  <Button
                    disabled={busy || checking}
                    onClick={() => {
                      setBriefId(null);
                      setCheckedBrief(null);
                      setSavedBrief(null);
                      setFileName("");
                      setFileError("");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </Card>}
        <Card title="From your brief">
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
          {!(run && live) && <Card title="Before you run">
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
                  : busy || checking
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
            {live && !project && <p role="alert">No active project is available for this brand.</p>}
            {blocked && (!live || readiness) && (
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
                  disabled={!ready || busy || preview || live}
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
                  disabled={!ready || busy || preview || (live && (!project || !canAct("saveBrief")))}
                  onClick={() => save("saveRunDraft")}
                >
                  {live ? "Save brief" : "Save as draft"}
                </Button>
                <Button
                  primary
                  disabled={blocked || !ready || busy || checking}
                  onClick={() => save("startRun")}
                >
                  {live ? "Start run" : agent?.name ? "Run " + agent.name : "Run agent"}
                </Button>
              </div>
            )}
            {preview && ready && <p className="muted">This preview runs Context Assembler and Brief Qualifier.</p>}
            {busy && ready && <p role="status">Running the skills. Keep this page open.</p>}
            {live && savedBrief && !busy && <p role="status">Brief saved.</p>}
            {feedback}
          </Card>}

      </div>
    </Page>
  );
}
