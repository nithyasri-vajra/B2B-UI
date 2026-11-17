# B2B Agents admin UI

Extract the project and run npm ci, then npm run dev. Run npm run build for production.

## Merge with the earlier sections

Create one admin store in the host app using createAdminStore(initialData, services) from src/adminData.js. Pass that store to AdminApp with the page and hrefFor(file, targetPage) props from your router. AdminApp exports adminPages. Home and Runs belong to the host. The standalone preview starts empty and keeps changes in memory until reload.

When an earlier screen receives an accepted submission or live update, call adminStore.ingest(data). The admin screens subscribe to this store and update automatically. For example, ingest({ runs: [savedRun] }) updates the client’s last run and the Admin Overview health counts.

Ingest merges supplied rows by stable identity. Omitted collections retain their values. Use the same client ID across sections.

| Collection | Identity | Fields read by the UI |
| --- | --- | --- |
| clients | id | name, website, industry, timezone, language, approver, backup, channel, linked, pageId, tokenExpiry, knowledge, archived, setupSteps |
| users | email | name, status, global, assignments keyed by client ID, requested client ID, note, last |
| runs | id | clientId, status, startedAt |
| uploads | id | clientId, name, domain, status, progress, recordCount |
| records | id | clientId, domain, item, state, grade, reuse, review, version, type, statement, wording, source, quote, scope, owner, collectedAt, approved, reviewBy, validUntil, history |
| proposals | id | clientId, source, before, after, evidence, materiality, affectedPosts, status |
| readiness | clientId | score, band, coverage, verified, canPublish, gates, domains, gaps |
| agents | id | name, version, availableVersion, status, readiness, reason, pipeline, limits |
| audit | id | timestamp (ISO 8601), clientId, actor, action, object, before, after, ip, device |
| notifications | id | clientId (optional), message, read |

Set integrations by service key (linkedin, storage, google, email). Set session to the signed-in user's name and role, or null to clear the top bar.

## Connect actions

The services argument maps action names to async functions. Each receives the payload including clientId where applicable. Return { data, message } to ingest the backend response and display optional feedback, false to cancel, or throw to show a failure. For example, uploadSources receives { clientId, domain, files }. Return uploads and any extracted records from the service. saveUserAccess receives before, after, reason and requiresStepUp.

Standalone behavior covers client creation/settings/archive, user pre-add/suspend/decline, setup saves, record review and conflicts in memory. Override these handlers for durable writes and authoritative audit. Upload, agent, readiness, publishing, proposals, outreach, LinkedIn and access changes requiring step-up need service handlers. The backend must authorize each action, enforce client scope and perform step-up before returning updates. Load or stream authoritative audit events from the backend.


## W01–W08 workflow routes

| Route | Screen |
| --- | --- |
| #sign-in | W01–W02 sign-in, access requested/denied, session expired |
| #home | W03 operator Home |
| #new-run | W04 attach brief and pre-run check |
| #runs?run=RUN_ID | W05 run workspace |
| #plan?run=RUN_ID | W06 plan approval |
| #post?run=RUN_ID&post=POST_ID | W07 post approval |
| #approvals | W08 approvals queue |
| #calendar | Scheduled post list, linked from the wireframe sidebar |
| #overview | Admin Overview |

The standalone preview opens Admin Overview. Use its Home and Runs links to enter the operator workspace, or open a route directly. The preview starts with no session or data. For the complete app, mount B2BAgents from src/main.jsx with a shared store and keep requireSignIn enabled, which is the default for B2BAgents. Use an element other than id="root" if importing the preview entry in a host that handles mounting itself. The host and backend supply allowed data, user session status and authorized services.

Session values include status (active, pending, denied or expired), name, email, role and clientIds. signIn may return a redirectUrl from the identity service. After returning from SSO, ingest the authorized session and client data. signOut must clear the session and invalidate backend credentials. Platform Admins can open the admin area. Knowledge access routes depend on role.

## Workflow data and services

The workflow uses the existing store plus briefs, tasks, plans, posts and approvals. Each uses a stable id and clientId. Plans, posts and approvals also use runId. Approval rows include gate (1 or 2), status, and postId for Gate 2; pending queue rows use status Pending. Pending plan items and posts use status Awaiting approval. Return readiness.canStart or passing hard gates before enabling new runs. Return connected, eligible LinkedIn test profiles under integrations.linkedin.profiles. The optional fixture-independent template URL is integrations.briefTemplateUrl.

Register services with createAdminStore(initialData, services). Return {data, message} to ingest results and display feedback. No credentials or provider tokens belong in the browser store.

- Identity: signIn, signOut, requestAccess.
- Brief and run: validateBrief, saveRunDraft, startRun, replaceBrief, cancelRun, askKnowledgeAdmin, rewriteWithoutClaim and answerRunQuestion. validateBrief receives the Excel File and must return briefId or data.briefs with a validated flag, issues, and parsed fields. Save/start actions return runId or data.runs.
- Plan review: editPlanItem, approvePlan, rejectPlan. The decision payload contains the selected item IDs and versions. The backend must check ownership, permissions, current versions and whether an additional Approver is needed.
- Post review: commentOnPost, requestProfileConnection, approvePost, approvePosts, requestPostChanges, holdPost, rejectPost. Approval requires current version, scheduled time, connected test profile and backend step-up. The UI sends the exact values and blocks stale confirmations. The backend must recheck them, enforce client and run scope, and reject unsafe or conflicting decisions before returning approved results.
- Drive pipeline transitions, QA, scheduling, publication checks, audit and notifications from the backend. Add the returned run, plan, post, task, approval and audit updates through data responses or store.ingest() as they arrive. A frontend button alone does not launch background work.
