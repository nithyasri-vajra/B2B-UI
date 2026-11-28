// Plain-word labels for the raw run status and stage keys the live backend sends.
export const runTones = { Completed: "g", Failed: "r", Blocked: "r", "Awaiting Gate 1": "b", "Awaiting Gate 2": "b",
  "Awaiting plan approval": "b", "Awaiting post approval": "b", Scheduled: "g", "Awaiting approval": "b", "Changes requested": "a", Live: "g", Approved: "g", "Agents working": "a", "Writing posts": "a" };
export const statusLabels = {
  running: "Agents working", awaiting_plan_approval: "Awaiting plan approval", awaiting_post_approval: "Awaiting post approval",
  writing: "Writing posts", blocked: "Blocked", failed: "Failed", cancelled: "Cancelled", completed: "Completed", draft: "Draft",
  scheduled: "Scheduled", approved: "Approved", published: "Published",
};
export const stageLabels = {
  "context-assembler": "Assembling context", "brief-qualifier": "Qualifying brief", "content-planner": "Planning content",
  gate_1: "Plan review", "post-writer": "Writing posts", "post-quality-analyst": "Quality check", gate_2: "Post review",
};
export const statusText = (value) => statusLabels[value] ?? statusLabels[String(value ?? "").toLowerCase().replace(/ /g, "_")] ??
  (typeof value === "string" ? value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : value);
export const statusTone = (value) => runTones[statusText(value)];
