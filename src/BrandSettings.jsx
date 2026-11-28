import { useEffect, useState } from "react";
import { Button, Card, Chip, Field, Page, Table } from "./AdminControls";
import { OurDialog } from "./OurUi";
import { createAuthServices } from "./authServices";

// Brand settings for the brand's Brand Managers: brand details, named approvers
// and who has which role on this brand. The backend checks every permission.
const authApiPath = import.meta.env.VITE_AUTH_API_PATH;
const roleOptions = [
  ["brand_manager", "Brand Manager"], ["approver", "Approver"], ["operator", "Operator"], ["viewer", "Viewer"],
];
const detailFields = [
  ["name", "Brand name", true], ["website", "Website", true], ["industry", "Industry", false],
  ["timezone", "Time zone", true],
];

function RoleChecks({ value, onChange, disabled, idPrefix }) {
  return <span className="role-checks" style={{ display: "inline-flex", flexWrap: "wrap", gap: 12 }}>
    {roleOptions.map(([key, label]) => <label key={key} htmlFor={idPrefix + key}>
      <input id={idPrefix + key} type="checkbox" checked={value.includes(key)} disabled={disabled}
        onChange={() => onChange(value.includes(key) ? value.filter((role) => role !== key) : [...value, key])} /> {label}
    </label>)}
  </span>;
}

export default function BrandSettings({ client, data }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({});
  const [edits, setEdits] = useState({});
  const [newEmail, setNewEmail] = useState("");
  const [newRoles, setNewRoles] = useState(["viewer"]);
  const [tab, setTab] = useState("details");
  const [addingAgent, setAddingAgent] = useState(false);
  const services = authApiPath ? createAuthServices(authApiPath).services : null;
  const me = data?.session?.email?.toLowerCase();

  const load = () => services.loadBrandSettings({ clientId: client.id }).then((result) => {
    setState(result);
    setDetails(Object.fromEntries(detailFields.map(([key]) => [key, result.brand[key] ?? ""])));
    setEdits({});
  });
  useEffect(() => {
    if (!services || !client?.id) return;
    load().catch((reason) => setError(reason.message));
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (work) => {
    setBusy(true); setMessage(""); setError("");
    try {
      const result = await work();
      setMessage(result?.message ?? "");
      await load();
    } catch (reason) {
      setError(reason.message || "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (!services) return <Page title="Brand settings"><p>Brand settings need the connected backend.</p></Page>;
  if (!client) return <Page title="Brand settings"><p>Select a brand.</p></Page>;
  const members = state?.members ?? [];
  const approvers = members.filter((member) => member.roles.includes("approver"));
  const brand = state?.brand;
  // Agents switched on for this brand (live agents only), as the backend lists them on the brand's projects.
  const brandAgents = [...new Map((data?.projects ?? []).filter(({ clientId }) => clientId === client.id)
    .flatMap(({ agents = [] }) => agents).map((agent) => [agent.agentKey, agent])).values()];
  const tabs = [["details", "Details"], ["people", "People"], ["agents", "Agents"], ["integrations", "Integrations"]];
  return <Page className="brand-settings-screen" title="Brand settings" description={client.name}>
    <nav className="our-tabs" aria-label="Brand settings sections">
      {tabs.map(([key, label]) => <button key={key} type="button" className={"our-tab our-tab-button" + (tab === key ? " on" : "")}
        aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setMessage(""); setError(""); }}>{label}</button>)}
    </nav>
    {error && <p role="alert">{error}</p>}
    {message && <p className="muted" role="status">{message}</p>}
    {!state && !error && <p className="muted">Loading…</p>}
    {brand && tab === "agents" && <section className="card our-flush">
      <div className="our-pad our-between"><div><h2>Agents on this brand</h2>
        <p className="muted">Agents that can run for {client.name}. Each agent's runs use this brand's knowledge and people.</p></div>
        <Button onClick={() => setAddingAgent(true)}>Add agent</Button></div>
      <div className="admin-table"><table>
        <thead><tr><th>Agent</th><th>Status</th></tr></thead>
        <tbody>
          {brandAgents.map((agent) => <tr key={agent.agentKey}><td className="our-strong">{agent.name ?? agent.agentKey}</td><td><Chip tone="g">On</Chip></td></tr>)}
          {!brandAgents.length && <tr><td colSpan={2} className="muted">No agents are switched on for this brand yet.</td></tr>}
        </tbody>
      </table></div>
    </section>}
    {addingAgent && <OurDialog title="Add an agent" onClose={() => setAddingAgent(false)}>
      <p>No other agents are available yet.</p>
      <p className="muted">When a new agent is built, it will appear here so you can add it to {client.name}.</p>
    </OurDialog>}
    {brand && tab === "integrations" && <section className="card our-stack">
      <div className="our-between"><h2>LinkedIn</h2><Chip>Not connected</Chip></div>
      <p>Connect LinkedIn so approved posts can be published from here.</p>
      <p className="muted">Connecting will be switched on once the LinkedIn app credentials are added.</p>
      <div><Button disabled>Connect LinkedIn</Button></div>
    </section>}
    {brand && tab === "details" && <>
      <Card title="Brand details">
        <form className="admin-form" onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(detailFields.filter(([key]) => (details[key] ?? "") !== (brand[key] ?? ""))
            .map(([key]) => [key, details[key]]));
          if (Object.keys(values).length) run(() => services.saveBrandDetails({ clientId: client.id, values }));
        }}>
          {detailFields.map(([key, label, required]) => <Field key={key} label={label}>
            <input required={required} value={details[key] ?? ""} disabled={busy || brand.archived}
              onChange={(event) => setDetails({ ...details, [key]: event.target.value })} />
          </Field>)}
          <Button primary type="submit" disabled={busy || brand.archived}>Save details</Button>
        </form>
      </Card>
    </>}
    {brand && tab === "people" && <>
      <Card title="People on this brand">
        <Table headers={["Person", "Roles", ""]} empty="Nobody has a role on this brand yet."
          rows={members.map((member) => {
            const roles = edits[member.id] ?? member.roles;
            const locked = busy || brand.archived || member.platformAdmin || member.email === me;
            const changed = edits[member.id] && roles.join() !== member.roles.join();
            return { key: member.id, cells: [
              <span><strong>{member.name}</strong><br /><span className="muted">{member.email}{member.status !== "active" ? " · " + member.status : ""}</span></span>,
              <RoleChecks idPrefix={member.id + "-"} value={roles} disabled={locked}
                onChange={(next) => setEdits({ ...edits, [member.id]: next })} />,
              locked ? <span className="muted">{member.email === me ? "You" : member.platformAdmin ? "Platform Admin" : ""}</span> : <>
                <Button primary disabled={!changed || !roles.length}
                  onClick={() => run(() => services.saveBrandMember({ clientId: client.id, email: member.email, roles }))}>Save</Button>{" "}
                <Button onClick={() => run(() => services.saveBrandMember({ clientId: client.id, email: member.email, roles: [] }))}>Remove</Button>
              </>,
            ] };
          })} />
        <form className="admin-form" onSubmit={(event) => {
          event.preventDefault();
          const email = newEmail.trim().toLowerCase();
          if (email && newRoles.length) run(async () => {
            const result = await services.saveBrandMember({ clientId: client.id, email, roles: newRoles });
            setNewEmail(""); setNewRoles(["viewer"]);
            return result;
          });
        }}>
          <Field label="Add a person (Vajra Global email)">
            <input type="email" required pattern="[^@\s]+@vajraglobal\.com" value={newEmail} disabled={busy || brand.archived}
              placeholder="name@vajraglobal.com" onChange={(event) => setNewEmail(event.target.value)} />
          </Field>
          <Field label="Roles"><RoleChecks idPrefix="new-" value={newRoles} disabled={busy || brand.archived} onChange={setNewRoles} /></Field>
          <Button primary type="submit" disabled={busy || brand.archived || !newRoles.length}>Add person</Button>
          <p className="muted">They can sign in with Google using this email. Platform-wide access is managed by a Platform Admin.</p>
        </form>
      </Card>
      <Card title="Named approvers">
        <p className="muted">Plans and posts that need an approver go to the main approver, or the backup when needed.</p>
        <form className="admin-form" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values = Object.fromEntries(["defaultApproverUserId", "backupApproverUserId"]
            .map((key) => [key, form.get(key)]).filter(([key, value]) => value && value !== String(brand[key] ?? "")));
          if (Object.keys(values).length) run(() => services.saveBrandDetails({ clientId: client.id, values }));
        }}>
          {[["defaultApproverUserId", "Main approver"], ["backupApproverUserId", "Backup approver"]].map(([key, label]) =>
            <Field key={key} label={label}>
              <select name={key} defaultValue={String(brand[key] ?? "")} disabled={busy || brand.archived}>
                <option value="">Not set</option>
                {approvers.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}
              </select>
            </Field>)}
          <Button primary type="submit" disabled={busy || brand.archived || !approvers.length}>Save approvers</Button>
          {!approvers.length && <p className="muted">Give someone the Approver role below first.</p>}
        </form>
      </Card>
    </>}
  </Page>;
}
