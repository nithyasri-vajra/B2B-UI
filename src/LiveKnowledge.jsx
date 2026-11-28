import { useState } from "react";
import { Button, Card, Field, Page, Table, useAction } from "./AdminControls";
import { isPlatformAdmin } from "./access";
import { knowledgeFileTypes } from "./authServices";

const sourceAreas = (fields) => fields.get("areas").split(",").map((area) => area.trim()).filter(Boolean);

export function LiveSources({ data, client, action, link, readOnly }) {
  const { submit, busy, feedback } = useAction(action);
  const sources = data.uploads.filter((row) => row.clientId === client?.id);
  const canAddSource = client && (!readOnly || isPlatformAdmin(data.session));
  return <Page className="knowledge-readiness" title="Knowledge" description={client?.name}>
    <nav className="knowledge-readiness-tabs" aria-label="Knowledge sections">
      <a {...link("Readiness.dc.html")}>Overview</a>
      <span aria-current="page">Sources</span>
      <a {...link("RecordReview.dc.html")}>Records</a>
    </nav>
    {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded. Reload to retry.</p>}
    {feedback}
    {canAddSource && <Card title="Add a link">
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        const areas = sourceAreas(fields);
        submit("addKnowledgeSource", { title: fields.get("title"), url: fields.get("url"), areas }, () => form.reset());
      }}>
        <Field label="Title"><input name="title" required /></Field>
        <Field label="Source URL"><input name="url" type="url" required /></Field>
        <Field label="Knowledge areas (comma separated)"><input name="areas" required /></Field>
        <Button primary type="submit" disabled={busy}>Add link</Button>
      </form>
    </Card>}
    {canAddSource && !client.archived && <Card title="File upload">
      <form className="admin-form" onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        submit("addKnowledgeSource", { file: fields.get("file"), areas: [...new Set(sourceAreas(fields))] },
          () => form.reset());
      }}>
        <Field label="Knowledge file (up to 2 MiB)">
          <input name="file" type="file" accept={knowledgeFileTypes.join(",")} required />
        </Field>
        <Field label="Knowledge areas (comma separated)"><input name="areas" required /></Field>
        <Button primary type="submit" disabled={busy}>Upload file</Button>
      </form>
    </Card>}
    <Card title="Sources"><Table headers={["Source", "Areas", "Type", "Processing"]}
      empty="No knowledge sources registered."
      rows={sources.map((row) => ({ key: row.id, cells: [row.name, row.domain, row.sourceType, row.status ?? "Unknown"] }))} /></Card>
  </Page>;
}

export function NewKnowledgeRecord({ sources, action }) {
  const [sourceId, setSourceId] = useState("");
  const source = sources.find((row) => row.id === sourceId);
  const { submit, busy, feedback } = useAction(action);
  return <Card title="Add record">
    {feedback}
    <form className="admin-form" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      submit("createKnowledgeRecord", Object.fromEntries(fields), () => {
        form.reset();
        setSourceId("");
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
  </Card>;
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
