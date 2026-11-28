import { useEffect, useState } from "react";
import { Button, Card, Chip, Page, Table } from "./AdminControls";
import { createAuthServices } from "./authServices";

// Platform Admin: background jobs that write posts and regenerate them from feedback.
const authApiPath = import.meta.env.VITE_AUTH_API_PATH;
const tones = { completed: "g", failed: "r", blocked: "r", running: "b", queued: "a", cancelled: "" };
const time = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const when = (value) => Number.isFinite(Date.parse(value)) ? time.format(new Date(value)) : "—";

export default function JobsAdmin() {
  const [status, setStatus] = useState("");
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setError("");
    try {
      setJobs((await createAuthServices(authApiPath).services.loadJobs({ status })).jobs);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { if (authApiPath) load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!authApiPath) return <Page title="Background jobs"><p>Background jobs need the connected backend.</p></Page>;
  return <Page title="Background jobs" description="Post writing and feedback regeneration jobs, newest first · times in IST"
    actions={<>
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>
        {["queued", "running", "completed", "failed", "blocked", "cancelled"].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <Button onClick={load} disabled={busy}>Refresh</Button>
    </>}>
    {error && <p role="alert">{error}</p>}
    <Card>
      <Table headers={["Job", "Brand", "Run", "Status", "Attempts", "Created", "Finished"]}
        empty={jobs ? "No jobs." : "Loading…"}
        rows={(jobs ?? []).map((job) => ({ key: job.id, cells: [
          <div><strong>{job.kind === "regenerate" ? "Regenerate post" : "Write posts"}</strong><div className="muted">{job.id}</div></div>,
          job.brandName ?? job.clientId,
          job.runTitle ?? job.runId ?? "—",
          <div><Chip tone={tones[job.status]}>{job.stuck ? "running (overdue)" : job.status}</Chip>
            {job.failureReason && <div className="muted">{job.failureReason}</div>}</div>,
          job.attempts,
          when(job.createdAt),
          when(job.finishedAt),
        ] }))} />
    </Card>
  </Page>;
}
