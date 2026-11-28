import { useEffect, useState } from "react";
import { Button, Card, Chip, Field, Page, useAction } from "./AdminControls";
import { KnowledgeTabs, MarkdownView, OurDialog } from "./OurUi";
import { isPlatformAdmin } from "./access";

const sourceAreas = (fields) => fields.get("areas").split(",").map((area) => area.trim()).filter(Boolean);
const knowledgeDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const showDate = (value) => value && Number.isFinite(Date.parse(value)) ? knowledgeDate.format(new Date(value)) : "—";

// Knowledge is a set of files (Markdown or CSV). Each file is one record with revisions:
// upload it, approve it, and publish a version. Uploading the same file name again adds its next revision.
export const uploadTypes = [".md", ".csv"];
const waitingStates = new Set(["needs_review", "captured", "verified"]);
const reviewTone = (status) => status === "approved" ? "g" : ["disputed", "expired", "rejected"].includes(status) ? "r" : status === "superseded" ? undefined : "a";
const statusName = (status) => ({ needs_review: "Waiting for review", captured: "Waiting for review", verified: "Waiting for review",
  rejected: "Rejected", approved: "Approved", disputed: "Withdrawn", expired: "Withdrawn", superseded: "Superseded" })[status] ?? "—";
const currentOf = (record) => record.revisions?.find((entry) => entry.revision === record.currentRevision) ?? {};
export const recordName = (record, sources) => {
  if (record.fileName) return record.fileName;
  const source = sources.find(({ id }) => id === String(record.sourceId));
  if (record.type === "document" && source) return source.name;
  const text = String(record.item ?? "").replace(/^#+\s*/, "").split("\n")[0];
  return text.length > 90 ? text.slice(0, 88) + "…" : text || "Untitled record";
};
const isCsv = (record, sources) => /\.csv$/i.test(recordName(record, sources));
const summary = (record, sources) => {
  const text = String(record.item ?? "");
  if (record.type !== "document") return "";
  if (isCsv(record, sources)) return csvRows(text) + " rows";
  const first = text.split("\n").map((line) => line.replace(/^[#>\-*\s]+/, "").trim()).find(Boolean) ?? "";
  return first.length > 100 ? first.slice(0, 98) + "…" : first;
};
// Counts data rows, ignoring line breaks inside quoted cells.
const csvRows = (text) => { let rows = 0; let quoted = false; let filled = false;
  for (const ch of String(text ?? "")) { if (ch === '"') quoted = !quoted; else if (ch === "\n" && !quoted) { if (filled) rows += 1; filled = false; } else if (ch.trim()) filled = true; }
  return Math.max(rows + (filled ? 1 : 0) - 1, 0); };
const defaultArea = (name) => name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "general";
const withParam = (href, record) => href && href + (href.includes("?") ? "&" : "?") + "record=" + encodeURIComponent(record);

// Upload any number of files at once. Each file keeps its own area and shows its own result.
export function UploadFiles({ action, records, sources, onClose, replace }) {
  const [files, setFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const known = new Map(records.map((record) => [recordName(record, sources).toLowerCase(), record]));
  const pick = (list) => setFiles([...list].map((file) => {
    const named = replace ? new File([file], replace.name, { type: file.type }) : file;
    const existing = known.get(named.name.toLowerCase());
    return { file: named, picked: file.name, area: replace?.area ?? existing?.domain ?? defaultArea(named.name), existing, state: "ready" };
  }));
  const bad = files.filter(({ file }) => !uploadTypes.includes(file.name.slice(file.name.lastIndexOf(".")).toLowerCase()) || file.size > 2 * 1024 * 1024);
  const finished = files.length > 0 && files.every(({ state }) => state === "done" || state === "failed");
  const start = async () => {
    setRunning(true);
    for (let index = 0; index < files.length; index += 1) {
      const entry = files[index];
      setFiles((list) => list.map((row, n) => n === index ? { ...row, state: "uploading" } : row));
      try {
        await action("addKnowledgeSource", { file: entry.file, areas: [entry.area.trim() || "general"] });
        setFiles((list) => list.map((row, n) => n === index ? { ...row, state: "done" } : row));
      } catch (error) {
        setFiles((list) => list.map((row, n) => n === index ? { ...row, state: "failed", error: error?.message || "Upload failed." } : row));
      }
    }
    setRunning(false);
  };
  const label = { ready: null, uploading: <Chip tone="b">Uploading…</Chip>, done: <Chip tone="g">Uploaded</Chip> };
  return <OurDialog title={replace ? "Upload a new version of " + replace.name : "Upload knowledge files"} onClose={onClose}>
    <p className="muted">{replace ? "The file you choose becomes the next revision of " + replace.name + " and waits for review."
      : "Choose one or more Markdown (.md) or CSV (.csv) files, up to 2 MB each. A file with the same name as an existing one becomes its next revision."}</p>
    {!running && !finished && <label className="our-file-pick">{files.length ? "Choose different files" : "Choose files"}
      <input type="file" multiple={!replace} accept={uploadTypes.join(",")} onChange={(event) => pick(event.target.files ?? [])} /></label>}
    {files.length > 0 && <table className="our-upload-list"><tbody>
      {files.map((entry, index) => <tr key={entry.picked + index}>
        <td><p className="our-strong">{entry.file.name}</p>
          <p className="muted">{entry.existing ? "Next revision of the existing file" : "New file"}{replace && entry.picked !== entry.file.name ? " · from " + entry.picked : ""}</p>
          {entry.error && <p className="our-error">{entry.error}</p>}</td>
        <td>{entry.state === "ready" && !replace ? <input aria-label={"Area for " + entry.file.name} value={entry.area}
          onChange={(event) => setFiles((list) => list.map((row, n) => n === index ? { ...row, area: event.target.value } : row))} />
          : <span className="muted">{entry.area}</span>}</td>
        <td className="our-right">{entry.state === "failed" ? <Chip tone="r">Failed</Chip> : label[entry.state]}</td>
      </tr>)}
    </tbody></table>}
    {bad.length > 0 && <p className="our-error">Only .md and .csv files up to 2 MB can be uploaded: {bad.map(({ file }) => file.name).join(", ")}.</p>}
    <div className="our-row our-dialog-actions">
      {finished ? <Button primary onClick={onClose}>Done</Button> : <>
        <Button onClick={onClose} disabled={running}>Cancel</Button>
        <Button primary disabled={!files.length || bad.length > 0 || running} onClick={start}>
          {running ? "Uploading…" : "Upload " + (files.length || "") + " file" + (files.length === 1 ? "" : "s")}</Button>
      </>}
    </div>
  </OurDialog>;
}

// Sources: the files and links knowledge came from.
export function LiveSources({ data, client, action, link, readOnly }) {
  const { submit, busy, feedback } = useAction(action);
  const [adding, setAdding] = useState(null);
  const sources = data.uploads.filter((row) => row.clientId === client?.id);
  const records = (data.records ?? []).filter((row) => row.clientId === client?.id);
  const recordsHref = link("RecordReview.dc.html").href;
  const canAddSource = client && (!readOnly || isPlatformAdmin(data.session));
  const done = () => setAdding(null);
  return <Page className="knowledge-readiness" title="Knowledge"
    description={client ? "Files and links for " + client.name + ". Each file becomes a record that is approved, then published." : undefined}
    actions={canAddSource && <>
      <Button onClick={() => setAdding("link")}>Add link</Button>
      {!client.archived && <Button primary onClick={() => setAdding("files")}>Upload files</Button>}
    </>}>
    <KnowledgeTabs link={link} current="Sources" />
    {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
    {feedback}
    <section className="card our-flush">
      <div className="admin-table"><table>
        <thead><tr><th>Source</th><th>Area</th><th>Updated</th><th>Status</th><th /></tr></thead>
        <tbody>
          {sources.map((row) => {
            const record = records.find((entry) => String(entry.sourceId) === row.id);
            const current = record ? currentOf(record) : null;
            const waiting = current && waitingStates.has(current.reviewStatus);
            return <tr key={row.id}>
              <td><p className="our-strong">{row.name}</p>
                <p className="muted">{row.sourceType === "link" ? "Link" + (row.url ? " · " + row.url : "") : record ? "Revision " + record.currentRevision : "File"}</p></td>
              <td>{row.domain || "—"}</td>
              <td>{showDate(row.updatedAt ?? row.createdAt)}</td>
              <td>{current ? <Chip tone={reviewTone(current.reviewStatus)}>{statusName(current.reviewStatus)}</Chip>
                : <span className="muted">{row.sourceType === "link" ? "Link only" : "Not readable"}</span>}</td>
              <td className="our-right">{record && recordsHref && <a className={waiting ? "btn pri" : "btn"} href={withParam(recordsHref, record.id)}>{waiting ? "Review" : "View"}</a>}</td>
            </tr>;
          })}
          {!sources.length && <tr><td colSpan={5} className="muted">No sources yet. Upload your knowledge files to start.</td></tr>}
        </tbody>
      </table></div>
    </section>
    {adding === "link" && <OurDialog title="Add a link" onClose={done}>
      <form className="our-stack" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        submit("addKnowledgeSource", { title: fields.get("title"), url: fields.get("url"), areas: sourceAreas(fields) }, done);
      }}>
        <label>Title<input name="title" required /></label>
        <label>Source URL<input name="url" type="url" required /></label>
        <label>Area<input name="areas" required placeholder="company" /></label>
        <div><Button primary type="submit" disabled={busy}>{busy ? "Adding…" : "Add link"}</Button></div>
      </form>
    </OurDialog>}
    {adding === "files" && <UploadFiles action={action} records={records} sources={sources} onClose={done} />}
  </Page>;
}

// The open record lives in the address (#records?record=…), so Back works and other screens can link straight to a record.
const hashParts = () => { const [page, query = ""] = window.location.hash.slice(1).split("?"); return [page, new URLSearchParams(query)]; };
function useRecordParam() {
  const [value, setValue] = useState(() => hashParts()[1].get("record"));
  useEffect(() => {
    const sync = () => setValue(hashParts()[1].get("record"));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const set = (id) => {
    const [page, params] = hashParts();
    if (id) params.set("record", id); else params.delete("record");
    window.location.hash = page + (params.size ? "?" + params.toString() : "");
    window.scrollTo?.(0, 0);
  };
  return [value, set];
}

export function LiveRecords({ data, client, action, link, readOnly }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [openId, open] = useRecordParam();
  const [uploading, setUploading] = useState(false);
  const records = client ? data.records.filter((item) => item.clientId === client.id) : [];
  const sources = client ? data.uploads.filter((row) => row.clientId === client.id) : [];
  const record = records.find(({ id }) => id === openId);
  if (record) return <RecordView record={record} records={records} sources={sources} client={client} action={action} link={link}
    readOnly={readOnly} onBack={() => open(null)} />;

  const waiting = records.filter((row) => waitingStates.has(currentOf(row).reviewStatus)).length;
  const visible = records.filter((row) => {
    const status = currentOf(row).reviewStatus;
    return (!state || (state === "waiting" ? waitingStates.has(status) : status === state)) &&
      [recordName(row, sources), row.domain].some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  }).sort((a, b) => recordName(a, sources).localeCompare(recordName(b, sources)));
  return <Page className="knowledge-readiness" title="Knowledge"
    description={client ? "Knowledge files for " + client.name + ". Approved files go to the agents when you publish a version." : "Select a brand to see its knowledge."}
    actions={!readOnly && client && <Button primary onClick={() => setUploading(true)}>Upload files</Button>}>
    <KnowledgeTabs link={link} current="Records" showSources={!readOnly || isPlatformAdmin(data.session)} />
    {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
    {!readOnly && waiting > 0 && <div className="our-alert warn our-between">
      <span><strong>{waiting} file{waiting === 1 ? "" : "s"} waiting for review.</strong> Approve them, then publish a new version from Overview.</span>
      {state !== "waiting" && <Button onClick={() => setState("waiting")}>Show them</Button>}
    </div>}
    <section className="card our-flush">
      <div className="our-toolbar">
        <input type="search" aria-label="Search knowledge" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
        {!readOnly && <select aria-label="Status" value={state} onChange={(event) => setState(event.target.value)}>
          <option value="">Any status</option>
          <option value="waiting">Waiting for review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>}
        <span className="muted">{visible.length} of {records.length}</span>
      </div>
      <div className="admin-table"><table>
        <thead><tr><th>File</th><th>Area</th><th>Status</th><th>Revision</th><th>Updated</th><th /></tr></thead>
        <tbody>
          {visible.map((row) => {
            const current = currentOf(row);
            const needsMe = !readOnly && waitingStates.has(current.reviewStatus);
            return <tr key={row.id}>
              <td><p className="our-strong">{recordName(row, sources)}</p><p className="muted">{summary(row, sources)}</p></td>
              <td>{row.domain}</td>
              <td><Chip tone={reviewTone(current.reviewStatus)}>{statusName(current.reviewStatus)}</Chip></td>
              <td>{row.currentRevision ?? "—"}</td>
              <td>{showDate(row.updatedAt ?? row.createdAt)}</td>
              <td className="our-right"><Button primary={needsMe} onClick={() => open(row.id)}>{needsMe ? "Review" : "View"}</Button></td>
            </tr>;
          })}
          {!visible.length && <tr><td colSpan={6} className="muted">{records.length ? "No files match." : "No knowledge yet. Upload your .md and .csv files to start."}</td></tr>}
        </tbody>
      </table></div>
    </section>
    {uploading && <UploadFiles action={action} records={records} sources={sources} onClose={() => setUploading(false)} />}
  </Page>;
}

// CSV files show as a table; Markdown as formatted text.
function CsvView({ text }) {
  // Quoted cells may contain commas and line breaks.
  const all = []; let row = []; let cell = ""; let quoted = false;
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) { if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); if (row.some((value) => value.trim())) all.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); if (row.some((value) => value.trim())) all.push(row);
  const [head = [], ...rows] = all;
  return <div className="our-doc"><div className="our-doc-table our-csv"><table>
    <thead><tr>{head.map((cell, n) => <th key={n}>{cell}</th>)}</tr></thead>
    <tbody>{rows.slice(0, 500).map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n}><div>{cell}</div></td>)}</tr>)}</tbody>
  </table></div>{rows.length > 500 && <p className="muted">Showing the first 500 of {rows.length} rows.</p>}</div>;
}

// One file on its own page: the full content on the left, review and history on the right.
function RecordView({ record, records, sources, client, action, link, readOnly, onBack }) {
  const { submit, busy, feedback } = useAction(action);
  const revisions = [...(record.revisions ?? [])].sort((a, b) => b.revision - a.revision);
  const [shown, setShown] = useState(null); // null = the current revision
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const current = currentOf(record);
  const selected = (shown != null && revisions.find(({ revision }) => revision === shown)) || current;
  const isCurrent = selected.revision === record.currentRevision;
  const name = recordName(record, sources);
  const csv = isCsv(record, sources);
  const save = (changes, done) => submit("reviseKnowledgeRecord", {
    id: record.id, currentRevision: record.currentRevision, statement: current.statement, ...changes,
  }, () => { setShown(null); done?.(); });
  const waiting = waitingStates.has(current.reviewStatus);
  const size = csv ? csvRows(selected.statement) + " rows"
    : String(selected.statement ?? "").split(/\s+/).filter(Boolean).length.toLocaleString("en-IN") + " words";
  const pickRevision = (value) => { setShown(value === record.currentRevision ? null : value); setEditing(false); };
  return <Page className="knowledge-readiness our-record-page" title={name}
    description={client ? "Knowledge file for " + client.name + "." : undefined}
    actions={<Button onClick={onBack}>All files</Button>}>
    <nav className="our-crumbs" aria-label="Breadcrumb"><a {...link("Readiness.dc.html")}>Knowledge</a> / <button type="button" className="our-linkish" onClick={onBack}>Records</button> / <span>{name}</span></nav>
    {feedback}
    {!isCurrent && <div className="our-alert info our-between"><span>You are looking at revision {selected.revision}. The current revision is {record.currentRevision}.</span>
      <Button onClick={() => pickRevision(record.currentRevision)}>Show current</Button></div>}
    <div className="our-record">
      <section className="card our-doc-card">
        <div className="our-between our-doc-head">
          <div className="our-row"><Chip tone={reviewTone(selected.reviewStatus)}>{statusName(selected.reviewStatus)}</Chip>
            <span className="muted">Revision {selected.revision} · {size}</span></div>
          <div className="our-row">
            {revisions.length > 1 && <select aria-label="Revision" value={selected.revision} onChange={(event) => pickRevision(Number(event.target.value))}>
              {revisions.map((entry) => <option key={entry.revision} value={entry.revision}>Revision {entry.revision} · {statusName(entry.reviewStatus)}</option>)}
            </select>}
            {!readOnly && isCurrent && !editing && <Button onClick={() => setEditing(true)}>Edit text</Button>}
          </div>
        </div>
        {editing ? <form className="our-stack our-doc-edit" onSubmit={(event) => {
          event.preventDefault();
          const statement = new FormData(event.currentTarget).get("statement");
          const approve = event.nativeEvent.submitter?.value === "approve";
          save({ statement, reviewStatus: approve ? "approved" : "captured" }, () => setEditing(false));
        }}>
          <textarea name="statement" aria-label="File text" defaultValue={current.statement} required />
          <p className="muted">Saving creates revision {record.currentRevision + 1}. Earlier revisions stay in the history.</p>
          <div className="our-row">
            <Button primary type="submit" value="approve" disabled={busy}>Save and approve</Button>
            <Button type="submit" value="review" disabled={busy}>Save for review</Button>
            <Button type="button" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form> : csv ? <CsvView text={selected.statement} /> : <MarkdownView text={selected.statement} />}
      </section>
      <aside className="our-stack">
        {!readOnly && <section className="card our-stack">
          <h2>Review</h2>
          {waiting ? <p>Revision {record.currentRevision} is waiting for review. Once approved, it goes to the agents in the next published version.</p>
            : current.reviewStatus === "approved" ? <p>Revision {record.currentRevision} is approved. Publish a version from Overview if you haven't yet.</p>
            : <p className="muted">Revision {record.currentRevision} is {statusName(current.reviewStatus).toLowerCase()}.</p>}
          <div className="our-row">
            {current.reviewStatus !== "approved" && <Button primary disabled={busy} onClick={() => save({ reviewStatus: "approved" })}>Approve revision {record.currentRevision}</Button>}
            {waiting && <Button className="btn danger" disabled={busy} onClick={() => save({ reviewStatus: "rejected" })}>Reject</Button>}
            {current.reviewStatus === "approved" && <Button disabled={busy} onClick={() => save({ reviewStatus: "rejected" })}>Withdraw approval</Button>}
          </div>
          <div className="our-line"><Button onClick={() => setUploading(true)}>Upload new version</Button></div>
        </section>}
        <section className="card our-stack">
          <h2>About this file</h2>
          <table className="our-summary"><tbody>
            <tr><td className="muted">Area</td><td>{record.domain ?? "—"}</td></tr>
            <tr><td className="muted">Revisions</td><td>{revisions.length}</td></tr>
            <tr><td className="muted">Added</td><td>{showDate(record.createdAt)}</td></tr>
            <tr><td className="muted">Updated</td><td>{showDate(record.updatedAt ?? record.createdAt)}</td></tr>
          </tbody></table>
        </section>
        {revisions.length > 1 && <section className="card our-flush">
          <div className="our-pad"><h2>History</h2></div>
          <ul className="our-revlist">
            {revisions.map((entry) => <li key={entry.revision} className={entry.revision === selected.revision ? "on" : undefined}>
              <button type="button" onClick={() => pickRevision(entry.revision)}>
                <span>Revision {entry.revision}</span>
                <Chip tone={reviewTone(entry.reviewStatus)}>{statusName(entry.reviewStatus)}</Chip>
              </button>
              <p className="muted">{entry.reviewedAt ? "Reviewed " + showDate(entry.reviewedAt) : entry.uploadedAt ? "Uploaded " + showDate(entry.uploadedAt) : "Added " + showDate(record.createdAt)}</p>
            </li>)}
          </ul>
        </section>}
      </aside>
    </div>
    {uploading && <UploadFiles action={action} records={records} sources={sources} replace={{ name, area: record.domain }} onClose={() => setUploading(false)} />}
  </Page>;
}

export function NewKnowledgeRecord({ sources, action, bare = false, onDone }) {
  const [sourceId, setSourceId] = useState("");
  const source = sources.find((row) => row.id === sourceId);
  const { submit, busy, feedback } = useAction(action);
  const Wrap = bare ? "div" : Card;
  return <Wrap {...(bare ? {} : { title: "Add record" })}>
    {feedback}
    <form className="admin-form" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      submit("createKnowledgeRecord", Object.fromEntries(fields), () => {
        form.reset();
        setSourceId("");
        onDone?.();
      });
    }}>
      <Field label="Source"><select name="sourceId" value={sourceId} required onChange={(event) => setSourceId(event.target.value)}>
        <option value="">Select a source</option>
        {sources.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></Field>
      <Field label="Area"><select key={sourceId} name="area" required>
        <option value="">Select an area</option>
        {source?.areas?.map((area) => <option key={area}>{area}</option>)}
      </select></Field>
      <Field label="Record type"><input name="recordType" required /></Field>
      <Field label="Statement"><textarea name="statement" required /></Field>
      <Button primary type="submit" disabled={busy || !source}>Add record</Button>
    </form>
  </Wrap>;
}

export function ReviseKnowledgeRecord({ record, action }) {
  const [revision] = useState(record.currentRevision);
  const { submit, busy, feedback } = useAction(action);
  return <form className="admin-form" onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    submit("reviseKnowledgeRecord", { ...Object.fromEntries(fields), id: record.id, currentRevision: revision });
  }}>
    <Field label="Statement"><textarea name="statement" defaultValue={record.item} required /></Field>
    <Field label="Evidence grade"><select name="evidenceGrade" defaultValue={record.grade ?? ""}>
      <option value="">None</option>{["A", "B", "C", "D"].map((value) => <option key={value}>{value}</option>)}
    </select></Field>
    <Field label="Review status"><select name="reviewStatus" defaultValue={record.state?.toLowerCase()}>
      {["captured", "verified", "approved", "disputed", "superseded", "expired", "rejected"].map((state) => <option key={state}>{state}</option>)}
    </select></Field>
    <Button primary type="submit" disabled={busy}>Save revision</Button>
    {feedback}
  </form>;
}
