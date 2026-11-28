import { useState } from "react";
import { Button, Card, Chip, Page, Table } from "./AdminControls";
import { isPlatformAdmin, rolesForClient } from "./access";
import { configuredAgent, WorkflowLink } from "./OperatorHome";
import "./brand-settings.css";

const roleLabels = {
  brand_manager: "Brand Manager", operator: "Operator",
  approver: "Approver", viewer: "Viewer",
};

export function MyProfile({ data }) {
  const session = data.session;
  const rows = data.clients.filter(({ archived }) => !archived).flatMap((brand) => {
    const roles = [...new Set(rolesForClient(session, brand.id))];
    return roles.length ? [[brand.name, roles.map((role) => roleLabels[role]).join(", ")]] : [];
  });
  const profile = session?.email && data.integrations.linkedin?.profiles?.find(
    ({ ownerEmail }) => ownerEmail?.toLowerCase() === session.email.toLowerCase(),
  );
  return (
    <Page className="brand-settings-screen" title="My profile"
      description={[session?.name, session?.email].filter(Boolean).join(" · ")}>
      <div className="brand-settings-profile">
        <Card title="My brands and roles">
          {isPlatformAdmin(session) && <div><Chip>Platform Admin</Chip></div>}
          <Table headers={["Brand", "Roles"]} rows={rows} empty="No brand roles assigned." />
        </Card>
        <Card title="LinkedIn test profile">
          <p>{profile?.connected ? `Connected as ${profile.name ?? session.name}` : "No connected test profile is available for this account."}</p>
        </Card>
      </div>
    </Page>
  );
}

const outputStatuses = new Set(["Approved", "Scheduled", "Publishing", "Live", "Published", "Published (unverified)", "Verified", "Ready to download"]);
const outputTime = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const outputTones = { Scheduled: "b", Live: "g", Published: "g", Verified: "g", Approved: "g", Publishing: "b" };

// Outputs: approved posts as cards with their text, using the devs' filters.
export function Outputs({ data, client, href }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState("");
  const outputs = client ? data.posts.filter((post) => post.clientId === client.id)
    .map((post) => ({ ...post, status: post.displayStatus ?? post.status }))
    .filter((post) => outputStatuses.has(post.status)) : [];
  const typeOf = (post) => post.type || "LinkedIn post";
  const shown = outputs.filter((post) => (!type || typeOf(post) === type) &&
    (!status || post.status === status) &&
    [post.title, post.copy, post.id].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const when = (value) => Number.isFinite(Date.parse(value)) ? outputTime.format(new Date(value)) : null;
  const copy = (post) => navigator.clipboard?.writeText(post.copy ?? "").then(() => setCopied(post.id)).catch(() => {});
  return (
    <Page className="outputs-screen" title="Outputs"
      description={client ? `Approved posts for ${client.name}: scheduled, live, or ready · times in IST` : "Select a brand to view its approved outputs."}>
      <div className="admin-actions">
        <input type="search" aria-label="Search outputs" placeholder="Search outputs" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Output type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All types</option>
          {[...new Set(outputs.map(typeOf))].map((value) => <option key={value}>{value}</option>)}
        </select>
        <select aria-label="Output status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Any status</option>
          {[...new Set(outputs.map((post) => post.status))].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      {!shown.length && <Card><p className="muted">{outputs.length ? "No approved outputs match these filters." : "No approved posts yet."}</p></Card>}
      <div className="outputs-grid" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))" }}>
        {shown.map((post) => (
          <Card key={post.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
              {post.runId && href("post") ? <a href={href("post", { run: post.runId, post: post.id })}><strong>{post.title ?? "Post"}</strong></a> : <strong>{post.title ?? "Post"}</strong>}
              <Chip tone={outputTones[post.status]}>{post.status}</Chip>
            </div>
            <p className="muted">{[when(post.publishedAt ?? post.scheduledAt), typeOf(post),
              post.version != null && "v" + post.version, post.approvedBy && "approved by " + post.approvedBy].filter(Boolean).join(" · ")}</p>
            {post.copy && <p style={{ whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{post.copy}</p>}
            <div className="admin-actions">
              {post.copy && <Button onClick={() => copy(post)}>{copied === post.id ? "Copied" : "Copy text"}</Button>}
              {post.status === "Scheduled" && href("calendar") && <WorkflowLink href={href("calendar")}>Calendar</WorkflowLink>}
              {/^(https):\/\//i.test(post.liveUrl ?? "") && <a href={post.liveUrl} target="_blank" rel="noreferrer">View on LinkedIn</a>}
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
