import { useState } from "react";
import { Button, Card, Chip, Field, Page, useAction } from "./AdminControls";
import { KnowledgeTabs, OurDialog } from "./OurUi";
import { isPlatformAdmin } from "./access";
import { knowledgeFileTypes } from "./authServices";

const sourceAreas = (fields) => fields.get("areas").split(",").map((area) => area.trim()).filter(Boolean);

const processingTone = (status) => /processed|ready|complete/i.test(status ?? "") ? "g" : /fail|error/i.test(status ?? "") ? "r" : "a";
const recordTone = (state) => /approved/i.test(state ?? "") ? "g" : /disputed|expired|rejected/i.test(state ?? "") ? "r" : "a";
const knowledgeDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const showDate = (value) => value && Number.isFinite(Date.parse(value)) ? knowledgeDate.format(new Date(value)) : "—";

// Our Sources screen: the list first, adding a link or file in a dialog. Same actions as before.
export function LiveSources({ data, client, action, link, readOnly }) {
  const { submit, busy, feedback } = useAction(action);
  const [adding, setAdding] = useState(null);
  const sources = data.uploads.filter((row) => row.clientId === client?.id);
  const canAddSource = client && (!readOnly || isPlatformAdmin(data.session));
  const done = () => setAdding(null);
  return <Page className="knowledge-readiness" title="Knowledge"
    description={client ? "Sources for " + client.name + ". Records are drawn from these and approved before they are published." : undefined}
    actions={canAddSource && <>
      <Button onClick={() => setAdding("link")}>Add link</Button>
      {!client.archived && <Button primary onClick={() => setAdding("file")}>Upload file</Button>}
    </>}>
    <KnowledgeTabs link={link} current="Sources" />
    {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
    {feedback}
    <section className="card our-flush">
      <div className="admin-table"><table>
        <thead><tr><th>Source</th><th>Areas</th><th>Type</th><th>Added</th><th>Processing</th></tr></thead>
        <tbody>
          {sources.map((row) => <tr key={row.id}>
            <td><p className="our-strong">{row.name}</p>{row.url && <p className="muted">{row.url}</p>}</td>
            <td>{row.domain || "—"}</td>
            <td>{row.sourceType === "link" ? "Link" : row.sourceType === "file" ? "File" : row.sourceType ?? "—"}</td>
            <td>{showDate(row.createdAt)}</td>
            <td><Chip tone={processingTone(row.status)}>{row.status ?? "Unknown"}</Chip></td>
          </tr>)}
          {!sources.length && <tr><td colSpan={5} className="muted">No sources yet. Add a link or upload a file to start.</td></tr>}
        </tbody>
      </table></div>
    </section>
    {canAddSource && <p className="muted">Files can be up to 2 MiB: {knowledgeFileTypes.join(", ")}.</p>}
    {adding === "link" && <OurDialog title="Add a link" onClose={done}>
      <form className="our-stack" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        submit("addKnowledgeSource", { title: fields.get("title"), url: fields.get("url"), areas: sourceAreas(fields) }, done);
      }}>
        <label>Title<input name="title" required /></label>
        <label>Source URL<input name="url" type="url" required /></label>
        <label>Knowledge areas (comma separated)<input name="areas" required placeholder="voice, company, audience" /></label>
        <div><Button primary type="submit" disabled={busy}>{busy ? "Adding…" : "Add link"}</Button></div>
      </form>
    </OurDialog>}
    {adding === "file" && <OurDialog title="Upload a knowledge file" onClose={done}>
      <form className="our-stack" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const fields = new FormData(event.currentTarget);
        submit("addKnowledgeSource", { file: fields.get("file"), areas: [...new Set(sourceAreas(fields))] }, done);
      }}>
        <label>File (up to 2 MiB)<input name="file" type="file" accept={knowledgeFileTypes.join(",")} required /></label>
        <label>Knowledge areas (comma separated)<input name="areas" required placeholder="voice, company, audience" /></label>
        <div><Button primary type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload file"}</Button></div>
      </form>
    </OurDialog>}
  </Page>;
}

// Our Records screen: filters above the table, record detail and adding a record in dialogs. Same actions as before.
export function LiveRecords({ data, client, action, link, readOnly }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [state, setState] = useState("");
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const records = client ? data.records.filter((item) => item.clientId === client.id) : [];
  const areas = [...new Set(records.map((record) => record.domain).filter(Boolean))].sort();
  const states = [...new Set(records.map((record) => record.state).filter(Boolean))].sort();
  const visible = records.filter((record) => (!area || record.domain === area) && (!state || record.state === state) &&
    [record.item, record.type, record.domain].some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase())));
  const record = records.find(({ id }) => id === openId);
  const sources = client ? data.uploads.filter((row) => row.clientId === client.id) : [];
  return <Page className="knowledge-readiness" title="Knowledge"
    description={client ? "Records for " + client.name + ". Only approved records are published to the agents." : "Select a brand to review knowledge records."}
    actions={!readOnly && client && <Button primary onClick={() => setAdding(true)}>Add record</Button>}>
    <KnowledgeTabs link={link} current="Records" showSources={!readOnly || isPlatformAdmin(data.session)} />
    {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
    <section className="card our-flush">
      <div className="our-toolbar">
        <input type="search" aria-label="Search records" placeholder="Search records" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Area" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="">All areas</option>{areas.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Status" value={state} onChange={(event) => setState(event.target.value)}>
          <option value="">Any status</option>{states.map((value) => <option key={value}>{value}</option>)}
        </select>
        <span className="muted">{visible.length} of {records.length}</span>
      </div>
      <div className="admin-table"><table>
        <thead><tr><th>Record</th><th>Area</th><th>Type</th><th>Status</th><th>Evidence</th><th>Review by</th><th /></tr></thead>
        <tbody>
          {visible.map((row) => <tr key={row.id}>
            <td>{row.item}</td>
            <td>{row.domain}</td>
            <td>{row.type ?? "—"}</td>
            <td><Chip tone={recordTone(row.state)}>{row.state ?? "—"}</Chip></td>
            <td>{row.grade ? "Grade " + row.grade : "—"}{row.reuse && <p className="muted">{row.reuse}</p>}</td>
            <td>{showDate(row.reviewBy)}</td>
            <td className="our-right"><Button onClick={() => setOpenId(row.id)}>{readOnly ? "View" : "Open"}</Button></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={7} className="muted">{records.length ? "No records match these filters." : "No records yet."}</td></tr>}
        </tbody>
      </table></div>
    </section>
    {record && <OurDialog title={"Record · revision " + (record.version ?? "—")} onClose={() => setOpenId(null)}>
      <div className="our-row"><Chip tone={recordTone(record.state)}>{record.state}</Chip><span className="muted">{[record.domain, record.type].filter(Boolean).join(" · ")}</span></div>
      {readOnly ? <p>{record.item}</p> : <ReviseKnowledgeRecord key={record.id + ":" + record.currentRevision} record={record} action={action} />}
    </OurDialog>}
    {adding && <OurDialog title="Add a record" onClose={() => setAdding(false)}>
      <NewKnowledgeRecord sources={sources} action={action} bare onDone={() => setAdding(false)} />
    </OurDialog>}
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
