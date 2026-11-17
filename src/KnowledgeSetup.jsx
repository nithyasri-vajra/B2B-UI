import { useRef } from "react";
import { Button, Card, Chip, Page, Table, useAction } from "./AdminControls";

const steps = [
  "Client profile",
  "Channel and governance",
  "Upload sources",
  "Extract and review",
  "Close gaps",
  "Readiness score",
  "Approve and publish",
];
const domains = [
  "Brand foundation",
  "Claims and evidence",
  "Audience",
  "Channel and account",
  "Engagement governance",
  "Market intelligence",
  "Assets and SMEs",
  "Practice and learning",
];

export default function KnowledgeSetup({
  link,
  action,
  onFiles,
  client,
  data,
}) {
  const picker = useRef(null);
  const domain = useRef(null);
  const { submit, busy, feedback } = useAction((name, payload) =>
    name === "uploadSources"
      ? onFiles(payload.files, payload.domain)
      : action(name, payload),
  );
  const uploads = data.uploads.filter((item) => item.clientId === client?.id);
  const readiness = data.readiness.find((item) => item.clientId === client?.id);

  function upload(files, target) {
    const accepted = Array.from(files).filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(pdf|docx|pptx|xlsx|csv|txt|vtt|png|jpg|jpeg|webp|gif)$/i.test(
          file.name,
        ),
    );
    if (accepted.length && client && !busy)
      submit("uploadSources", { files: accepted, domain: target });
  }

  function pick(target = null) {
    domain.current = target;
    picker.current.click();
  }

  return (
    <Page
      title={"Knowledge setup" + (client ? " · " + client.name : "")}
      description="Upload and review sources for the selected client."
      actions={
        <>
          <Button
            disabled={!client || busy}
            onClick={() => submit("saveKnowledgeSetup")}
          >
            Save setup
          </Button>
          <a className="btn pri" {...link("RecordReview.dc.html")}>
            Next: review records
          </a>
        </>
      }
    >
      {!client && (
        <p className="muted">Create a client to begin knowledge setup.</p>
      )}
      <div
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
          aria-label="Setup steps"
        >
          {steps.map((step, i) => (
            <div key={step} className="step">
              <span className="dot">{i + 1}</span>
              {step}
              {client?.setupSteps?.[i] && <Chip>{client.setupSteps[i]}</Chip>}
            </div>
          ))}
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
          <button
            type="button"
            className="ph"
            style={{ minHeight: 72, background: "#fff" }}
            disabled={!client || busy}
            onClick={() => pick()}
          >
            Drop files anywhere · PDF, DOCX, PPTX, XLSX, CSV, TXT/VTT
            transcripts, images
          </button>
          <input
            ref={picker}
            hidden
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.vtt,image/*"
            onChange={(event) => {
              upload(event.currentTarget.files, domain.current);
              event.currentTarget.value = "";
            }}
          />
          {feedback}
          <div className="admin-grid">
            {domains.map((name, i) => {
              const key = "D" + (i + 1);
              const items =
                readiness?.domains?.find((item) => item.id === key)?.items ??
                [];
              return (
                <Card key={key} title={key + " " + name}>
                  {items.length ? (
                    items.map((item) => (
                      <p key={item.id}>
                        {item.level} · {item.name} <Chip>{item.status}</Chip>
                      </p>
                    ))
                  ) : (
                    <p className="muted">No checklist items yet.</p>
                  )}
                  <Button disabled={!client || busy} onClick={() => pick(key)}>
                    Upload to {key}
                  </Button>
                  {key === "D6" && (
                    <Button
                      disabled={!client || busy}
                      onClick={() => submit("runMarketResearch")}
                    >
                      Run market research
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
          <Card title="Recent uploads">
            <Table
              headers={["File", "Domain", "Status", "Records"]}
              rows={uploads.map((item) => [
                item.name,
                item.domain ?? "—",
                <Chip>
                  {item.status ?? "—"}
                  {item.progress != null && " · " + item.progress + "%"}
                </Chip>,
                item.recordCount ?? "—",
              ])}
              empty="No sources uploaded yet."
            />
          </Card>
        </section>
      </div>
    </Page>
  );
}
