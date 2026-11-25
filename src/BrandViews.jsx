import { useState } from "react";
import { Card, Chip, Page, Table } from "./AdminControls";
import { isPlatformAdmin, rolesForClient } from "./access";
import { configuredAgent, WorkflowLink } from "./OperatorHome";
import "./brand-settings.css";

const roleLabels = {
  knowledge_admin: "Brand Manager", marketing_operator: "Operator",
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

const outputStatuses = new Set(["Approved", "Scheduled", "Live", "Published", "Published (unverified)", "Verified", "Ready to download"]);

export function Outputs({ data, client, href }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const outputs = client ? data.posts.filter((post) => post.clientId === client.id && outputStatuses.has(post.status)) : [];
  const typeOf = (post) => post.type || "LinkedIn post";
  const shown = outputs.filter((post) => (!type || typeOf(post) === type) &&
    (!status || post.status === status) && (post.title ?? post.id).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Page className="brand-settings-screen" title="Outputs"
      description={client ? `Approved outputs for ${client.name}.` : "Select a brand to view its approved outputs."}>
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
      <Card>
        <Table headers={["Output", "Type", "Version", "Approved by", "Approved", "Status", ""]}
          rows={shown.map((post) => [
            <div><strong>{post.title ?? post.id}</strong><div className="muted">{configuredAgent(data, post.agentId)?.name}</div></div>,
            typeOf(post), post.version ?? "—", post.approvedBy ?? "—", post.approvedAt ?? "—", <Chip>{post.status}</Chip>,
            <div className="admin-actions">
              {post.runId && <WorkflowLink href={href("post", { run: post.runId, post: post.id })}>Open</WorkflowLink>}
              {post.status === "Scheduled" && <WorkflowLink href={href("calendar")}>Calendar</WorkflowLink>}
              {/^(https):\/\//i.test(post.liveUrl ?? "") && <a href={post.liveUrl}>View live</a>}
            </div>,
          ])}
          empty="No approved outputs match these filters."
        />
      </Card>
    </Page>
  );
}
