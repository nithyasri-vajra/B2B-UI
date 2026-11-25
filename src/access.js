const clientPages = {
  knowledge_admin: ["home", "runs", "plan", "post", "calendar", "setup", "records", "knowledge", "readiness", "audit"],
  approver: ["home", "new-run", "runs", "approvals", "plan", "post", "calendar", "records", "knowledge", "readiness"],
  marketing_operator: ["home", "new-run", "runs", "approvals", "plan", "post", "calendar", "records", "knowledge", "readiness"],
  viewer: ["home", "runs", "plan", "post", "calendar", "knowledge", "readiness"],
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
  if (page === "profile") return hasAccess(session);
  if (page === "outputs") return clientId != null && (isPlatformAdmin(session) || rolesForClient(session, clientId).length > 0);
  const adminClientPages = ["home", "runs", "plan", "post", "calendar", "records", "knowledge", "readiness", "setup"];
  return (isPlatformAdmin(session) && platformPages.includes(page)) ||
    (isPlatformAdmin(session) && clientId != null && adminClientPages.includes(page)) ||
    rolesForClient(session, clientId).some((role) => clientPages[role].includes(page));
}

export function landingPage(session, clientId) {
  if (isPlatformAdmin(session)) return "overview";
  const roles = rolesForClient(session, clientId);
  if (roles.includes("knowledge_admin")) return "readiness";
  if (roles.includes("approver")) return "approvals";
  if (roles.includes("marketing_operator")) return "home";
  if (roles.includes("viewer")) return "calendar";
}

export function canPerformAction(session, clientId, name, run, { separation = false } = {}) {
  if (name === "signIn" || name === "signOut") return true;
  if (name === "requestAccess") return session?.status === "pending";
  if (platformActions.includes(name)) return isPlatformAdmin(session);
  if (name === "loadAudit") return canOpenPage(session, clientId, "audit");
  if (clientId == null || (run && String(run.clientId) !== String(clientId))) return false;
  const roles = rolesForClient(session, clientId);
  const admin = isPlatformAdmin(session);
  const approver = roles.includes("approver");
  const operator = roles.includes("marketing_operator");
  const ownerEmail = run?.ownerEmail ?? run?.owner;
  const owner = Boolean(session?.email && typeof ownerEmail === "string" &&
    ownerEmail.toLowerCase() === session.email.toLowerCase());
  const ownRun = operator && owner;
  if (name === "saveBrief") return operator || approver;
  if (name === "uploadSources" || name === "saveKnowledgeSetup")
    return admin || roles.includes("knowledge_admin");
  if (knowledgeActions.includes(name)) return roles.includes("knowledge_admin");
  if (name === "requestPlanApproval") return ownRun;
  if (name === "approvePlan" || name === "rejectPlan")
    return ownRun || (approver && !owner && run?.requiresApprover === true);
  if (name === "approvePost" || name === "approvePosts")
    return Boolean(run && approver && (!separation || (ownerEmail && !owner)));
  if (["cancelRun", "holdPost", "cancelScheduledPost"].includes(name))
    return Boolean(run && (admin || approver || ownRun));
  if (name === "editPlanItem" || name === "replaceBrief")
    return Boolean(run && (approver || ownRun));
  if (name === "commentOnPost") return Boolean(run && (approver || operator));
  if (name === "answerRunQuestion") return Boolean(run && (approver || ownRun));
  if (approvalActions.includes(name)) return Boolean(run && approver);
  if (runOwnerActions.includes(name)) return ownRun;
  return operatorActions.includes(name) && (approver || (operator && (!run || owner)));
}
