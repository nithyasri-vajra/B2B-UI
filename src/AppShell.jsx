import { useEffect, useId, useState } from "react";
import { isPlatformAdmin, rolesForClient } from "./access";
import "./app-shell.css";

// Navigation and layout shared by the brand workspace and the admin area.
// Every link comes from href(target), which returns nothing when the signed-in
// person may not open that page, so role rules stay in access.js.

const roleLabels = {
  brand_manager: "Brand Manager", operator: "Operator",
  approver: "Approver", viewer: "Viewer",
};
export const knowledgePages = ["knowledge", "readiness", "setup", "records"];

const paths = {
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.2 2.5 3.6 5.2" /></>,
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  runs: <><path d="M4 6h11M4 12h8M4 18h6" /><path d="m16 13 5 3.5-5 3.5z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  file: <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></>,
  book: <><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  plug: <><path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  bot: <><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4M9 13v2M15 13v2" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
};
export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  );
}

const initials = (name) => String(name ?? "").split(/\s+/).filter(Boolean).slice(0, 2)
  .map((part) => part[0].toUpperCase()).join("") || "—";
export const BrandMark = ({ brand, size = 24 }) => (
  <span className="shell-mono" style={{ width: size, height: size, fontSize: size < 32 ? 10 : 13 }}>{initials(brand?.name)}</span>
);

function NavItem({ href, icon, current, count, children }) {
  if (!href) return null;
  return (
    <a href={href} className={"nav shell-nav" + (current ? " on" : "")} aria-current={current ? "page" : undefined}>
      <Icon name={icon} /><span>{children}</span>{count ? <span className="shell-count">{count}</span> : null}
    </a>
  );
}

export function roleSummary(session, clients) {
  if (isPlatformAdmin(session)) return "Platform Admin";
  const roles = new Set(clients.flatMap((client) => rolesForClient(session, client.id)));
  return [...roles].map((role) => roleLabels[role]).join(" · ") || "No role yet";
}

/**
 * page: the current route key. href(target): link for a brand-scoped page or nothing.
 * platformHref(target): link for a platform page or nothing.
 */
export function AppShell({
  page, session, clients, client, onClientChange, href, platformHref = href,
  brandsHref, approvalsHref, approvalsCount, profileHref, onSignOut, className = "", children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const switcherId = useId();
  useEffect(() => setMenuOpen(false), [page, client?.id]);
  const current = ["plan", "post"].includes(page) ? "runs" : knowledgePages.includes(page) ? "knowledge" : page;
  const knowledgeHref = ["knowledge", "readiness", "records", "setup"].map((target) => href(target)).find(Boolean);
  const admin = isPlatformAdmin(session);
  const platform = [
    ["overview", "chart", "Platform overview"],
    ["clients", "grid", "Brand spaces"],
    ["users", "people", "People"],
    ["requests", "inbox", "Access requests"],
    ["agents", "bot", "Agents and skills"],
    ["jobs", "runs", "Background jobs"],
    ["integrations", "plug", "Integrations"],
    ["audit", "list", "Audit log"],
  ];
  const platformActive = { "new-client": "clients" }[page] ?? page;
  return (
    <div className={"b2b-admin workflow app-shell " + className}>
      <div className="app">
        <nav className={"side shell-side" + (menuOpen ? " open" : "")} aria-label="Main">
          <a className="shell-logo" href={brandsHref ?? href("home") ?? "#"}>
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4h19L12 21z" fill="#B8973A" /><path d="M8 7h8l-4 7z" fill="#1B4D3E" /></svg>
            B2B Agents
          </a>
          {clients.length > 0 && onClientChange && (
            <label className="shell-switch" htmlFor={switcherId}>
              <span>Brand</span>
              <select id={switcherId} value={client?.id ?? ""} onChange={(event) => onClientChange(event.target.value)}>
                {!client && <option value="" disabled>All brands</option>}
                {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <NavItem href={brandsHref} icon="grid" current={page === "my-brands"}>My brands</NavItem>
          <NavItem href={approvalsHref} icon="check" current={page === "approvals"} count={approvalsCount}>My approvals</NavItem>
          {client && (
            <>
              <p className="shell-group">{client.name}</p>
              <NavItem href={href("home")} icon="home" current={current === "home"}>Brand home</NavItem>
              <NavItem href={href("runs")} icon="runs" current={current === "runs" || current === "new-run"}>Runs</NavItem>
              <NavItem href={href("calendar")} icon="calendar" current={current === "calendar"}>Content calendar</NavItem>
              <NavItem href={href("outputs")} icon="file" current={current === "outputs"}>Outputs</NavItem>
              <NavItem href={knowledgeHref} icon="book" current={current === "knowledge"}>Knowledge</NavItem>
              {!admin && <NavItem href={href("audit")} icon="list" current={current === "audit"}>Audit log</NavItem>}
              {admin
                ? <NavItem href={platformHref("client-settings")} icon="gear" current={current === "client-settings"}>Brand settings</NavItem>
                : <NavItem href={href("brand-settings")} icon="gear" current={current === "brand-settings"}>Brand settings</NavItem>}
            </>
          )}
          {admin && (
            <>
              <p className="shell-group">Platform</p>
              {platform.map(([target, icon, label]) => (
                <NavItem key={target} href={platformHref(target)} icon={icon} current={platformActive === target}>{label}</NavItem>
              ))}
            </>
          )}
          <div className="shell-spacer" />
          {session && (
            <a className={"nav shell-nav shell-me" + (page === "profile" ? " on" : "")} href={profileHref}>
              <span className="shell-avatar">{initials(session.name ?? session.email)}</span>
              <span className="shell-me-text">
                <strong>{session.name ?? session.email}</strong>
                <span>{roleSummary(session, clients)}</span>
              </span>
            </a>
          )}
          {onSignOut && <button type="button" className="nav shell-nav shell-signout" onClick={onSignOut}><Icon name="logout" /><span>Sign out</span></button>}
        </nav>
        {menuOpen && <button type="button" className="shell-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
        <div className="main">
          <header className="top shell-top">
            <button type="button" className="btn shell-menu" aria-label="Open menu" aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
            <nav aria-label="Breadcrumb" className="shell-crumb">
              {client ? <><BrandMark brand={client} /><span>{client.name}</span></> : <span>All brands</span>}
            </nav>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
