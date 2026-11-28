import { useEffect, useRef } from "react";

// Our modal dialog: native <dialog>, closes on Escape or the Close button.
export function OurDialog({ title, onClose, children, actions }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  return (
    <dialog ref={ref} className="our-dialog" aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="our-between"><h2>{title}</h2><button type="button" className="btn" onClick={onClose}>Close</button></div>
      <div className="our-stack">{children}</div>
      {actions && <div className="our-row our-dialog-actions">{actions}</div>}
    </dialog>
  );
}

export function KnowledgeTabs({ link, current, showSources = true }) {
  const tabs = [["Readiness.dc.html", "Overview"], showSources && ["KnowledgeSetup.dc.html", "Sources"], ["RecordReview.dc.html", "Records"]].filter(Boolean);
  return (
    <nav className="our-tabs" aria-label="Knowledge sections">
      {tabs.map(([file, label]) => label === current
        ? <span key={label} className="our-tab on" aria-current="page">{label}</span>
        : <a key={label} className="our-tab" {...link(file)}>{label}</a>)}
    </nav>
  );
}

// Shows a knowledge document as formatted text. Builds React elements (no raw HTML), so file content can't inject markup.
function inline(text, keyBase) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = keyBase + ":" + match.index;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) parts.push(<a key={key} href={match[2]} target="_blank" rel="noreferrer">{token.slice(1, token.indexOf("]"))}</a>);
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

export function MarkdownView({ text }) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = "b" + i;
    if (!line.trim()) { i += 1; continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = "h" + Math.min(heading[1].length + 1, 6);
      blocks.push(<Tag key={key}>{inline(heading[2], key)}</Tag>);
      i += 1; continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { blocks.push(<hr key={key} />); i += 1; continue; }
    // Tables, allowing blank lines between rows (some knowledge files are written that way).
    const nextLine = (from) => { let n = from; while (n < lines.length && !lines[n].trim()) n += 1; return n; };
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[nextLine(i + 1)] ?? "")) {
      const head = cells(line);
      const rows = [];
      i = nextLine(i + 1) + 1;
      while (i < lines.length && /^\s*\|/.test(lines[nextLine(i)] ?? "")) { i = nextLine(i); rows.push(cells(lines[i])); i += 1; }
      blocks.push(<div key={key} className="our-doc-table"><table>
        <thead><tr>{head.map((cell, n) => <th key={n}>{inline(cell, key + n)}</th>)}</tr></thead>
        <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n}>{inline(cell, key + r + ":" + n)}</td>)}</tr>)}</tbody>
      </table></div>);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      blocks.push(<blockquote key={key}>{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
        i += 1;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { item += " " + lines[i].trim(); i += 1; }
        items.push(item);
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={key}>{items.map((item, n) => <li key={n}>{inline(item, key + n)}</li>)}</List>);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) { para.push(lines[i].trim()); i += 1; }
    if (!para.length) { para.push(line.trim()); i += 1; }
    // Keep the writer's line breaks: knowledge files often list "Owner: …" style lines one after another.
    blocks.push(<p key={key}>{para.flatMap((text, n) => n ? [<br key={"br" + n} />, ...inline(text, key + ":" + n)] : inline(text, key + ":" + n))}</p>);
  }
  return <div className="our-doc">{blocks}</div>;
}
