import { useRef, useState } from "react";
import { Button, Card, Chip, Field, Page, Table, useAction } from "./AdminControls";
import { canStartRun, configuredAgent } from "./OperatorHome";
import "./run-flow.css";
import periodBriefTemplate from "./Period Brief Template - LinkedIn.xlsx?url";

const briefFields = [
  ["title", "Brief title"], ["period", "Period"], ["objective", "Objective"],
  ["audience", "Audience"], ["deliverables", "Deliverables"], ["kpi", "KPI"],
];

function LiveBrief({ brief, projectId, action }) {
  const revision = brief?.versions?.find(({ version }) => version === brief.currentVersion);
  const [values, setValues] = useState(() => Object.fromEntries(briefFields.map(([key]) => {
    const value = key === "title" ? brief?.title : revision?.[key];
    return [key, value == null ? "" : typeof value === "string" ? value : JSON.stringify(value)];
  })));
  const { busy, submit, feedback } = useAction(action);
  const [saved, setSaved] = useState(false);
  return (
    <form className="admin-form" onSubmit={async (event) => {
      event.preventDefault();
      setSaved(false);
      const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [
        key, value === (typeof revision?.[key] === "object" ? JSON.stringify(revision[key]) : undefined) ? revision[key] : value.trim(),
      ]));
      if (Object.values(fields).some((value) => value === "")) return;
      await submit("saveBrief", { projectId, values: { ...fields,
        ...(brief ? {
          briefId: brief.id,
          currentVersion: brief.currentVersion,
          ...Object.fromEntries(["fileRef", "templateVersion", "keyDates", "blackoutDays", "postingSlots"]
            .filter((key) => revision?.[key] != null).map((key) => [key, revision[key]])),
        } : {}),
      } }, () => setSaved(true));
    }}>
      {briefFields.map(([key, label]) => <Field key={key} label={label}>
        <input required value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
      </Field>)}
      <Button primary type="submit" disabled={busy || saved || Boolean(brief && !revision)}>Save brief</Button>
      {saved && <p role="status">Brief saved.</p>}
      {brief && !revision && <p role="alert">The current revision is unavailable. Reload the app before editing.</p>}
      {feedback}
    </form>
  );
}

function LiveNewRun({ data, client, run, href, action, canAct }) {
  const projects = data.projects.filter(({ clientId }) => clientId === client?.id);
  const [selected, setSelected] = useState(run?.projectId ?? projects[0]?.id ?? "");
  const [briefId, setBriefId] = useState(run?.briefId ?? "");
  const briefs = data.briefs.filter(({ projectId }) => projectId === selected);
  const brief = briefs.find(({ id }) => id === briefId);
  return (
    <Page className="new-run-screen" title={run ? "Run brief" : "New run"}>
      <a href={href("runs")}>← Runs</a>
      {data.workflowLoadError && <p role="alert">{data.workflowLoadError}</p>}
      <Card title="Period brief">
        <p>Excel upload and automatic run execution are unavailable on the connected backend.</p>
        {projects.length ? <Field label="Project">
          <select value={selected} disabled={Boolean(run)} onChange={(event) => { setSelected(event.target.value); setBriefId(""); }}>
            {projects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field> : <p>No projects are available for this brand.</p>}
        {selected && !run && canAct("saveBrief") && <>
          <Field label="Brief">
            <select value={briefId} onChange={(event) => setBriefId(event.target.value)}>
              <option value="">Create a brief</option>
              {briefs.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
            </select>
          </Field>
          <LiveBrief key={selected + ":" + briefId + ":" + (brief?.currentVersion ?? 0)} brief={brief}
            projectId={selected} action={async (name, payload) => {
              const result = await action(name, payload);
              const savedBrief = result?.data?.briefs?.[0];
              if (savedBrief) setBriefId(savedBrief.id);
              return result;
            }} />
        </>}
        {selected && (run || !canAct("saveBrief")) && <p>{brief?.title ?? "Brief editing is unavailable for this view."}</p>}
      </Card>
    </Page>
  );
}

export default function NewRun(props) {
  return props.data.liveAccess ? <LiveNewRun {...props} /> : <PreviewNewRun {...props} />;
}

function PreviewNewRun({ data, client, run, href, navigate, action, preview }) {
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
  const currentStep = fileName ? 2 : 1;

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
      className="workflow-setup-page new-run-screen"
      title={run ? "Replace period brief" : "New run"}
      description="Choose an agent, attach its brief and run."
    >
      {href("runs") && <a href={href("runs")}>← Runs</a>}
      <ol className="new-run-steps" aria-label="Run setup steps">
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
      </ol>
      <Card title="Agent">
        <div className="new-run-agent">
          <strong>{agent?.name ?? "Agent workflow"}</strong>
          {agent?.description && <p>{agent.description}</p>}
          <Chip tone={blocked ? "a" : "g"}>{blocked ? "Readiness check required" : "Ready"}</Chip>
        </div>
      </Card>
      <div className="new-run-layout">
        <div className="new-run-setup">
          <Card title={agent?.name ? "Brief · " + agent.name : "Period brief"}>
            <a href={templateUrl} download={templateUrl === periodBriefTemplate ? "period-brief-template.xlsx" : true}>
              Download brief template (.xlsx)
            </a>
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
          <Card title="Before you run">
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
    </Page>
  );
}
