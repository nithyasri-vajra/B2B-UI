import { useRef, useState } from "react";
import { Button, Card, Chip, Field, Page, Table, useAction } from "./AdminControls";

import { knowledgeFiles } from "./extractKnowledgeRecords";
import "./knowledge-sources-records.css";
import { isPlatformAdmin } from "./access";

export default function KnowledgeSetup({
  link,
  action,
  onFiles,
  readOnly,
  client,
  data,
}) {
  const picker = useRef(null);
  const folderPicker = useRef(null);
  const knowledgePicker = useRef(null);
  const selectedKnowledgeFile = useRef(null);
  const folderUploadInProgress = useRef(false);
  const [folderUpload, setFolderUpload] = useState(null);
  async function uploadSources(files, domain) {
    if (!data.liveAccess) return onFiles(files, domain);
    const errors = [];
    for (const file of files) {
      try {
        await action("uploadKnowledgeFile", { file, domain });
      } catch (error) {
        errors.push(file.name + ": " + error.message);
      }
    }
    if (errors.length) throw new Error(errors.join(" "));
    return { message: files.length === 1 ? "Source uploaded." : "Sources uploaded." };
  }
  const { submit, busy, feedback } = useAction((name, payload) =>
    name === "uploadSources" ? uploadSources(payload.files, payload.domain) : action(name, payload),
  );
  const uploads = data.uploads.filter((item) => item.clientId === client?.id);
  const readiness = data.readiness.find((item) => item.clientId === client?.id);
  const isUploadingFolder = folderUpload?.active ?? false;
  const controlsBusy = busy || isUploadingFolder || (data.liveAccess && readOnly && !isPlatformAdmin(data.session));
  const currentFolder = folderUpload?.clientId === client?.id ? folderUpload : null;
  const fileStatuses = knowledgeFiles.map(({ name }) => {
    const savedUpload = uploads.findLast((item) => item.name?.toLowerCase() === name);
    const savedStatus = savedUpload?.status?.toLowerCase();
    const uploaded = ["uploaded", "processing", "extracting", "extracted", "completed"].includes(savedStatus);
    return currentFolder?.statuses[name] ?? (uploaded ? "Uploaded" : "Waiting");
  });

  function uploadFolder(files) {
    if (!client || controlsBusy || folderUploadInProgress.current) return;

    const selectedFiles = Array.from(files);
    const matches = knowledgeFiles.map(({ name, domains }) => ({
      name,
      domain: domains[0],
      files: selectedFiles.filter((file) => file.name.toLowerCase() === name),
    }));
    const missing = matches.filter((match) => !match.files.length).map(({ name }) => name);
    const duplicates = matches.filter((match) => match.files.length > 1).map(({ name }) => name);
    const errors = [
      missing.length && `Missing files: ${missing.join(", ")}.`,
      duplicates.length && `Multiple copies found: ${duplicates.join(", ")}.`,
    ].filter(Boolean);
    if (errors.length) {
      setFolderUpload({ clientId: client.id, statuses: {}, errors });
      return;
    }

    return uploadKnowledgeFiles(matches);
  }

  async function uploadKnowledgeFiles(matches) {
    if (!client || controlsBusy || folderUploadInProgress.current) return;
    folderUploadInProgress.current = true;
    setFolderUpload({
      clientId: client.id,
      active: true,
      statuses: {
        ...currentFolder?.statuses,
        ...Object.fromEntries(matches.map(({ name }) => [name, "Queued"])),
      },
      errors: [],
    });
    function setFileStatus(name, status, error) {
      setFolderUpload((previous) => ({
        ...previous,
        statuses: { ...previous.statuses, [name]: status },
        errors: error ? [...previous.errors, `${name}: ${error}`] : previous.errors,
      }));
    }

    try {
      for (const [index, { name, domain, files }] of matches.entries()) {
        setFileStatus(name, "Uploading");
        try {
          const result = await uploadSources(files, domain);
          const failed = result?.data?.uploads?.some((item) =>
            item.name?.toLowerCase() === name &&
            ["failed", "error", "rejected"].includes(item.status?.toLowerCase()),
          );
          if (result === false || failed) {
            throw new Error(result?.message || "Upload could not be completed.");
          }
          setFileStatus(name, "Uploaded");
          if (index < matches.length - 1) {
            // Give the sidebar time to paint even when the preview service resolves immediately.
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } catch (error) {
          setFileStatus(name, "Failed", error?.message || "Upload could not be completed.");
        }
      }
    } finally {
      folderUploadInProgress.current = false;
      setFolderUpload((previous) => ({ ...previous, active: false }));
    }
  }

  function upload(files, target) {
    const accepted = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(md|pdf|docx|pptx|xlsx|csv|txt|vtt|png|jpg|jpeg|webp|gif)$/i.test(
          file.name,
        ),
    );
    if (accepted.length && client && !controlsBusy && !folderUploadInProgress.current)
      submit("uploadSources", { files: accepted, domain: target });
  }

  return (
    <Page
      className="knowledge-readiness knowledge-sources-screen"
      title="Knowledge"
      description="Upload and review sources for the selected client."
      actions={
        <>
          {!data.liveAccess && <Button
            disabled={!client || controlsBusy}
            onClick={() => submit("saveKnowledgeSetup")}
          >
            Save setup
          </Button>}
          <a className="btn pri" {...link("RecordReview.dc.html")}>
            Next: review records
          </a>
        </>
      }
    >
      <nav className="knowledge-readiness-tabs" aria-label="Knowledge sections">
        <a {...link("Readiness.dc.html")}>Readiness</a>
        <span aria-current="page">Sources</span>
        <a {...link("RecordReview.dc.html")}>Records</a>
      </nav>
      {!client && (
        <p className="muted">
          <a {...link("#new-client")}>Create a client</a> to enable folder uploads.
        </p>
      )}
      {data.liveAccess && client && <>
        {data.brandKnowledgeLoadError && <p role="alert">Some knowledge data could not be loaded.</p>}
        {(!readOnly || isPlatformAdmin(data.session)) && <Card title="Add a link">
          <form className="admin-form" onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            const areas = fields.get("areas").split(",").map((area) => area.trim()).filter(Boolean);
            submit("addKnowledgeSource", { title: fields.get("title"), url: fields.get("url"), areas }, () => form.reset());
          }}>
            <Field label="Title"><input name="title" required /></Field>
            <Field label="Source URL"><input name="url" type="url" required /></Field>
            <Field label="Knowledge areas"><input name="areas" required placeholder="Comma-separated areas" /></Field>
            <Button primary type="submit" disabled={busy}>Add link</Button>
          </form>
        </Card>}
        <Card title="Registered sources">
          <Table headers={["Source", "Areas", "Type", "Processing"]}
            rows={uploads.map((row) => [row.name, row.domain, row.sourceType, row.status ?? "Unknown"])} />
        </Card>
        <p className="muted">Maximum file size is 2 MiB per file.</p>
      </>}
      <div className="knowledge-source-layout"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <nav
          className="card admin-card"
          style={{ flex: "1 1 230px", maxWidth: 260 }}
          aria-label="Knowledge file uploads"
        >
          <ul className="knowledge-upload-list" aria-live="polite">
            {knowledgeFiles.map(({ name }, index) => (
              <li key={name} className="step">
                <span className="dot">
                  {fileStatuses[index] === "Uploaded" && (
                    <svg className="knowledge-upload-done" viewBox="0 0 24 24" role="img" aria-label="Uploaded">
                      <path d="M3.5 12.5l5.5 5.5L20.5 5.5" />
                    </svg>
                  )}
                </span>
                {name}
              </li>
            ))}
          </ul>
        </nav>
        <section
          className="admin-card"
          style={{ flex: "999 1 560px" }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            upload(event.dataTransfer.files, null);
          }}
        >
          <Button primary disabled={!client || controlsBusy} onClick={() => folderPicker.current.click()}>
            Upload knowledge folder
          </Button>
          <input
            ref={folderPicker}
            hidden
            type="file"
            multiple
            webkitdirectory=""
            onChange={(event) => {
              uploadFolder(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="knowledge-source-drop"
            style={{ minHeight: 72, background: "#fff" }}
            disabled={!client || controlsBusy}
            onClick={() => picker.current.click()}
          >
            <strong>Drop files here or browse</strong>
            <span>MD, PDF, DOCX, PPTX, XLSX, CSV, TXT/VTT transcripts and images</span>
          </button>
          <input
            ref={picker}
            hidden
            type="file"
            multiple
            accept=".md,.pdf,.docx,.pptx,.xlsx,.csv,.txt,.vtt,image/*"
            onChange={(event) => {
              upload(event.currentTarget.files, null);
              event.currentTarget.value = "";
            }}
          />
          {feedback}
          <input
            ref={knowledgePicker}
            hidden
            type="file"
            accept=".md"
            onChange={(event) => {
              const [file] = event.currentTarget.files;
              event.currentTarget.value = "";
              if (!file) return;
              const { name, domains } = selectedKnowledgeFile.current;
              if (file.name.toLowerCase() !== name) {
                setFolderUpload({ clientId: client.id, statuses: currentFolder?.statuses ?? {}, errors: [`Select ${name} for this card.`] });
                return;
              }
              uploadKnowledgeFiles([{ name, domain: domains[0], files: [file] }]);
            }}
          />
          {!!currentFolder?.errors.length && (
            <ul role="alert">
              {currentFolder.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          <div className="admin-grid">
            {knowledgeFiles.map(({ name, domains }) => {
              const items = domains.flatMap(
                (id) => readiness?.domains?.find((item) => item.id === id)?.items ?? [],
              );
              return (
                <Card key={name} title={name.replace(/\.md$/i, "")}>
                  {items.map((item) => (
                      <p key={item.id}>
                        {item.level} · {item.name} <Chip>{item.status}</Chip>
                      </p>
                  ))}
                  <Button
                    disabled={!client || controlsBusy}
                    onClick={() => {
                      selectedKnowledgeFile.current = { name, domains };
                      knowledgePicker.current.click();
                    }}
                  >
                    Upload {name}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </Page>
  );
}
