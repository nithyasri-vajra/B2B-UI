import { Chip, Table } from "./AdminControls";

const tones = { READY: "g", LIMITED: "a", BLOCKED: "r", PASS: "g", REVISE: "a" };
const explanation = /\b(reason|reasons|blockers?|limitations?|restrictions|blocking issues?|why|decision rationale)\b/i;
const processHeading = /^(?:assistant|instructions?|tool calls?|execution log|search (?:process|log|strategy)|files (?:searched|inspected)|methodology|internal (?:notes|analysis))\b/i;
const processLine = /^(?:I (?:searched|looked|checked|reviewed|read|used|found|ran|will|can|have)|here(?:'s| is| are) (?:the|what)|as requested|(?:analysis|final answer):)/i;

function plain(text) {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g, (_, bold, alternate, code) => bold ?? alternate ?? code)
    .trim();
}

function cells(line) {
  return line.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((cell) => plain(cell.replace(/\\\|/g, "|")));
}

export function parseSkillReport(report) {
  const lines = (report ?? "").split(/\r?\n/).map((line) => line.trim());
  const blocks = [];
  let hidden = false;
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (marker) {
      fence = fence ? null : (marker[2].trim().toLowerCase() || "markdown");
      continue;
    }
    if (!line || hidden && !/^#{1,6}\s/.test(line) || fence && !["md", "markdown"].includes(fence)) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const label = plain(line.replace(/^[-*+]\s+|^\d+[.)]\s+/, ""));
    if (heading) {
      const title = plain(heading[1]);
      hidden = processHeading.test(title);
      if (!hidden) blocks.push({ type: "heading", text: title });
    } else if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "") &&
        cells(lines[i + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const headers = cells(line);
      const rows = [];
      i += 1;
      while (lines[i + 1]?.includes("|")) {
        const row = cells(lines[++i]);
        rows.push(headers.map((_, index) => row[index] ?? ""));
      }
      blocks.push({ type: "table", headers, rows });
    } else if (!processLine.test(label) && !/^[-*_]{3,}$/.test(line)) {
      const type = /^[-*+]\s+|^\d+[.)]\s+/.test(line) ? "item" : "text";
      if (type === "item" && blocks.at(-1)?.type === "list") blocks.at(-1).items.push(label);
      else blocks.push(type === "item" ? { type: "list", items: [label] } : { type, text: label });
    }
  }
  return blocks.filter((block, index) => block.type !== "heading" ||
    (blocks[index + 1] && blocks[index + 1].type !== "heading"));
}

function reportReason(blocks) {
  for (const [index, block] of blocks.entries()) {
    if (block.type === "text" && /^(?:verdict\s+)?(?:reason|why|limitation|blocker)\s*:/i.test(block.text))
      return block.text.replace(/^[^:]+:\s*/, "");
    if (block.type !== "heading" || !explanation.test(block.text)) continue;
    const next = blocks[index + 1];
    const reason = next?.type === "list" ? next.items[0] : next?.type === "text" ? next.text : null;
    if (reason && !/^(?:none|n\/a|no (?:blockers|limitations|restrictions))\b/i.test(reason)) return reason;
  }
}

export default function SkillResult({ name, stage }) {
  const verdict = stage.verdict?.toUpperCase();
  const blocks = parseSkillReport(stage.report);
  const needsReason = ["BLOCKED", "LIMITED", "REVISE"].includes(verdict);
  const reason = needsReason && (stage.reason?.trim() || reportReason(blocks));
  return (
    <section className="run-skill-result">
      <div className="admin-row">
        <h3>{name}</h3>
        {verdict && <Chip tone={tones[verdict]}>{verdict[0] + verdict.slice(1).toLowerCase()}</Chip>}
      </div>
      {needsReason && <p className="run-skill-reason">{reason || "The skill did not return a specific reason. Check the result details below."}</p>}
      {blocks.map((block, index) => {
        if (block.type === "heading") return <h4 key={index}>{block.text}</h4>;
        if (block.type === "table") return <Table key={index} headers={block.headers} rows={block.rows} empty="No rows reported." />;
        if (block.type === "list") return <ul key={index}>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
        return block.text === reason ? null : <p key={index}>{block.text}</p>;
      })}
    </section>
  );
}
