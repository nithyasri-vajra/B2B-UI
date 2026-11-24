const clientPages = {
  knowledge_admin: ["setup", "records", "knowledge", "readiness", "audit"],
  approver: ["runs", "approvals", "plan", "post", "calendar", "audit", "records", "knowledge", "readiness"],
  marketing_operator: ["home", "new-run", "runs", "plan", "post", "calendar", "records", "knowledge", "readiness"],
  viewer: ["runs", "post", "calendar", "knowledge", "readiness"],
};

const platformPages = [
  "overview", "clients", "new-client", "client-settings", "users", "requests", "agents", "integrations", "audit",
];

const platformActions = [
  "loadClients", "createClient", "saveClientSettings", "archiveClient", "reconnectClientLinkedIn",
  "loadUsers", "saveUserAccess", "preAddUser", "suspendUser", "removeUserFromClient",
  "declineAccessRequest", "enableAgentVersion", "saveAgentLimits", "testLinkedInConnection", "revokeLinkedInTestProfile",
];
const knowledgeActions = [
  "uploadSources", "saveKnowledgeSetup", "recalculateReadiness", "publishKnowledge",
  "draftClientQuestions", "askClient", "markGapNotApplicable", "reviewKnowledgeChange",
  "editKnowledgeRecord", "approveKnowledgeRecord", "rejectKnowledgeRecord",
  "disputeKnowledgeRecord", "supersedeKnowledgeRecord", "resolveKnowledgeConflict",
];
const approvalActions = [
  "approvePlan", "rejectPlan", "approvePost", "approvePosts", "requestPostChanges",
  "holdPost", "rejectPost", "cancelScheduledPost", "commentOnPost", "requestProfileConnection",
];
const operatorActions = ["validateBrief", "saveRunDraft", "startRun"];
const runOwnerActions = [
  "replaceBrief", "cancelRun", "planContent", "askKnowledgeAdmin", "rewriteWithoutClaim",
  "answerRunQuestion", "editPlanItem",
];

export const isPlatformAdmin = (session) =>
  session?.status === "active" && Array.isArray(session.globalRoles) &&
  session.globalRoles.includes("platform_admin");

export function rolesForClient(session, clientId) {
  if (session?.status !== "active" || clientId == null) return [];
  return assignments(session)
    .filter((assignment) => assignment?.clientId != null && String(assignment.clientId) === String(clientId))
    .flatMap(({ roles }) => Array.isArray(roles) ? roles : [])
    .filter((role) => Object.hasOwn(clientPages, role));
}

const assignments = (session) => Array.isArray(session?.clientAssignments) ? session.clientAssignments : [];

export const hasAccess = (session) =>
  isPlatformAdmin(session) || assignments(session)
    .some((assignment) => rolesForClient(session, assignment?.clientId).length > 0);

export function canOpenPage(session, clientId, page) {
  return (isPlatformAdmin(session) && platformPages.includes(page)) ||
    rolesForClient(session, clientId).some((role) => clientPages[role].includes(page));
}

export function landingPage(session, clientId) {
  return ["overview", "setup", "approvals", "home", "calendar"]
    .find((page) => canOpenPage(session, clientId, page));
}

export function canPerformAction(session, clientId, name, run) {
  if (name === "signIn" || name === "signOut") return true;
  if (name === "requestAccess") return session?.status === "pending";
  if (platformActions.includes(name)) return isPlatformAdmin(session);
  if (name === "loadAudit") return canOpenPage(session, clientId, "audit");
  const roles = rolesForClient(session, clientId);
  if (knowledgeActions.includes(name)) return roles.includes("knowledge_admin");
  if (approvalActions.includes(name)) return roles.includes("approver");
  if (!roles.includes("marketing_operator")) return false;
  if (runOwnerActions.includes(name) || (run && operatorActions.includes(name))) {
    const ownerEmail = run?.ownerEmail ?? run?.owner;
    return Boolean(session.email && typeof ownerEmail === "string" &&
      ownerEmail.toLowerCase() === session.email.toLowerCase());
  }
  return operatorActions.includes(name);
}
