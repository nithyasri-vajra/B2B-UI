import { useState } from "react";
import { canPerformAction, rolesForClient } from "./access";
import "./my-brands.css";

const roleNames = {
  knowledge_admin: "Brand Manager",
  approver: "Approver",
  marketing_operator: "Operator",
  viewer: "Viewer",
};
const day = 86400000;
const postDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata",
});
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function brandSummary(client, data, session, now, weekStart, canReviewRecords) {
  const inBrand = (item) => item.clientId === client.id;
  const roles = [...new Set(rolesForClient(session, client.id))];
  const runs = data.runs.filter(inBrand);
  const active = runs.filter(({ status }) => !["Completed", "Cancelled", "Failed", "Draft"].includes(status)).length;
  const approvals = data.approvals.filter((item) => {
    if (!inBrand(item) || ![1, 2].includes(item.gate) || item.status !== "Pending" || item.canApprove === false) return false;
    const run = runs.find(({ id }) => id === item.runId);
    if (!run) return false;
    if (item.gate === 1 && !roles.includes("approver")) {
      const owner = run.ownerEmail ?? run.owner;
      if (!roles.includes("marketing_operator") || !session.email || typeof owner !== "string" || owner.toLowerCase() !== session.email.toLowerCase()) return false;
    }
    return canPerformAction(session, client.id, item.gate === 1 ? "approvePlan" : "approvePost", run);
  });
  const posts = data.posts.filter(inBrand);
  const scheduled = posts.filter(({ status }) => status === "Scheduled");
  const next = Math.min(...scheduled.map(({ scheduledAt }) => Date.parse(scheduledAt)).filter((date) => date >= now));
  const thisWeek = (value) => Date.parse(value) >= weekStart && Date.parse(value) < weekStart + 7 * day;
  const live = posts.filter(({ status, publishedAt, scheduledAt }) => status === "Published" && thisWeek(publishedAt ?? scheduledAt)).length;
  const planned = scheduled.filter(({ scheduledAt }) => thisWeek(scheduledAt)).length;
  const review = canReviewRecords ? data.records.filter((record) => {
    const date = Date.parse(record.reviewBy);
    return inBrand(record) && date >= now && date < now + 7 * day;
  }).length : 0;
  const readiness = data.readiness.find(inBrand);
  const blocked = posts.filter(({ status }) => status === "Blocked").length;
  const attention = blocked + approvals.length + review;
  return { client, roles, active, approvals, next, live, planned, review, readiness, blocked, attention };
}

export default function MyBrands({ clients, data, session, href, peopleHref, adminHref, approvalsHref, logout, profileHref }) {
  const [sort, setSort] = useState("attention");
  const [query, setQuery] = useState("");
  const now = Date.now();
  const offset = 330 * 60000;
  const today = Math.floor((now + offset) / day) * day;
  const weekStart = today - ((new Date(today).getUTCDay() + 6) % 7) * day - offset;
  const brands = clients.map((client) => brandSummary(client, data, session, now, weekStart, Boolean(href("records", client.id))));
  const approvals = brands.flatMap((brand) => brand.approvals);
  const plans = approvals.filter(({ gate }) => gate === 1).length;
  const live = brands.reduce((total, brand) => total + brand.live, 0);
  const scheduled = brands.reduce((total, brand) => total + brand.planned, 0);
  const stats = [
    ["Waiting on you", approvals.length, `${approvals.length - plans} posts · ${plans} plans`],
    ["Active runs", brands.reduce((total, brand) => total + brand.active, 0), `across ${brands.filter(({ active }) => active).length} brands`],
    ["Posts this week", live + scheduled, `${live} live · ${scheduled} scheduled`],
    ["Knowledge to review", brands.reduce((total, brand) => total + brand.review, 0), "records due within 7 days"],
  ];
  const visible = brands.filter(({ client }) => client.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "attention" ? b.attention - a.attention : 0) || a.client.name.localeCompare(b.client.name));
  const name = session.name || session.email || "Account";

  return (
    <div className="b2b-admin my-brands">
      <aside className="my-brands-sidebar">
        <strong className="my-brands-logo"><span aria-hidden="true">▼</span> B2B Agents</strong>
        <select aria-label="Switch brand" value="" onChange={(event) => window.location.assign(event.target.value)}>
          <option value="" disabled>All brands</option>
          {brands.map(({ client }) => <option key={client.id} value={href("home", client.id)}>{client.name}</option>)}
        </select>
        <nav aria-label="Across brands">
          <a href="#my-brands" aria-current="page">My brands</a>
          {approvalsHref && <a href={approvalsHref}>My approvals <span>{approvals.length}</span></a>}
          {peopleHref && <a href={peopleHref}>People</a>}
          {adminHref && <a href={adminHref}>Platform admin</a>}
        </nav>
        <div className="my-brands-profile">
          <span aria-hidden="true">{initials(name)}</span>
          <div><strong>{name}</strong><small>{brands.length} {brands.length === 1 ? "brand" : "brands"}</small></div>
        </div>
        {profileHref && <a href={profileHref}>My profile</a>}
        {logout}
      </aside>
      <div className="my-brands-content">
        <header className="my-brands-toolbar">
          <span>All brands / My brands</span>
          <input type="search" aria-label="Search brands" placeholder="Search brands" value={query} onChange={(event) => setQuery(event.target.value)} />
        </header>
        <main className="my-brands-main">
          <div className="my-brands-heading">
            <div><h1>My brands</h1><p>{brands.length} {brands.length === 1 ? "brand" : "brands"} you can access.</p></div>
            <select aria-label="Sort brands" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="attention">Needs attention first</option><option value="name">Brand name</option>
            </select>
          </div>
          {data.clientsLoadError && <p role="alert">{data.clientsLoadError}</p>}
          <section className="my-brands-stats" aria-label="Brand summary">
            {stats.map(([label, value, detail]) => (
              <div key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
            ))}
          </section>
          {visible.length === 0 && <p>{query ? "No brands match your search." : "No brands available."}</p>}
          <section className="my-brands-grid" aria-label="Brands">
            {visible.map(({ client, roles, active, approvals, next, readiness, blocked, review }) => (
              <article key={client.id} className="my-brand-card">
                <div className="my-brand-card-heading">
                  <span className="my-brand-avatar" aria-hidden="true">{initials(client.name)}</span>
                  <div>
                    <h2><a href={href("home", client.id)}>{client.name}</a></h2>
                    {roles.map((role) => <span className="my-brand-role" key={role}>{roleNames[role]}</span>)}
                  </div>
                  {readiness?.score != null && <span className="my-brand-readiness">{readiness.status ?? readiness.band ?? "Readiness"} · {readiness.score}</span>}
                </div>
                <dl>
                  <div><dt>Active runs</dt><dd>{active}</dd></div>
                  <div><dt>Waiting on you</dt><dd>{approvals.length || "—"}</dd></div>
                  <div><dt>Next post</dt><dd>{Number.isFinite(next) ? postDate.format(next) : "—"}</dd></div>
                </dl>
                <footer>{blocked ? `${blocked} blocked posts` : approvals.length ? `${approvals.length} approvals waiting on you` : review ? `${review} knowledge records due for review` : "Nothing needs you"}</footer>
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
