import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Check,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Info,
  LayoutGrid,
  Pencil,
  Pin,
  PinOff,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RequestAccessButton } from "./RequestAccessButton";
import { deleteThread, getThread, listThreads, threadsChangedEvent, type ThreadMetadata } from "../storage/threads";
import { loadSettings } from "../storage/settings";
import { requestWorkingConversations } from "../storage/request-conversations";
import { draftIntentions, type DraftIntention, type IntakeMessage, type IntakeResponse } from "../../shared/draft-intake";

const businessCaseIdsStorageKey = "dpl-business-case-ids";
const requestDomains = [
  "Eurex Trading",
  "Eurex Risk",
  "Eurex Clearing",
  "Global Products and Markets",
  "Cash Trading",
  "Eurex Repo",
  "Eurex Cash Regulatory Reporting",
] as const;

const lifecycle = [
  { label: "Inception & Scoping", shortLabel: "Inception & Scoping" },
  { label: "Analysis & Design", shortLabel: "Analysis & Design" },
  { label: "Build", shortLabel: "Build" },
  { label: "Test & Deployment", shortLabel: "Test & Deployment" },
  { label: "Consumption, Maintenance & Monitoring", shortLabel: "Consumption, Maintenance & Monitoring" },
  { label: "Retirement", shortLabel: "Retirement" },
] as const;

type LifecycleStage = (typeof lifecycle)[number]["label"];
type LifecycleTask = { name: string; responsible?: string; optional?: boolean };
const stageDetails: Record<LifecycleStage, { description: string; tasks: LifecycleTask[] }> = {
  "Inception & Scoping": {
    description: "Review the request, confirm domain ownership, and approve or reject its scope.",
    tasks: [
      { name: "Request Under Review", responsible: "Domain Owner + Requester" },
      { name: "Domain Reassigned", responsible: "Current Domain Owner → New Domain Owner", optional: true },
      { name: "Request Approved or Request Rejected" },
    ],
  },
  "Analysis & Design": {
    description: "Initiate analysis, prepare requirements, and complete prioritization.",
    tasks: [
      { name: "Analysis Initiation", responsible: "DPO" },
      { name: "Requirements In Progress", responsible: "DPO + Requester + Business Data Steward + Pod IT Lead + AI Assistant" },
      { name: "Requirements Completed & Prioritization" },
    ],
  },
  Build: {
    description: "Provision infrastructure and implement the data product.",
    tasks: [
      { name: "Infrastructure Provisioning", responsible: "Pod IT Lead + DevOps + AI Assistant" },
      { name: "Infrastructure Provisioned" },
      { name: "Implementation Started", responsible: "Developers / Data Engineers + Pod IT Lead" },
      { name: "Implementation Completed", responsible: "Developers / Data Engineers + AI Pair" },
    ],
  },
  "Test & Deployment": {
    description: "Complete CM control, acceptance testing, deployment, and publishing.",
    tasks: [
      { name: "CM Control", responsible: "Release Manager + Pod IT Lead" },
      { name: "In Test", responsible: "Acceptance Team + DPO + IT Data Steward" },
      { name: "Test Completed", responsible: "DPO + Requester + Acceptance Team" },
      { name: "Deployment & Publishing Completed", responsible: "Release Engineer + Automated Pipeline" },
    ],
  },
  "Consumption, Maintenance & Monitoring": {
    description: "Onboard consumers, monitor usage and data quality, review service health, and maintain the product until retirement begins.",
    tasks: [
      { name: "Consumer Onboarding" },
      { name: "Usage Monitoring" },
      { name: "Data Quality Monitoring" },
      { name: "Service Review" },
      { name: "Maintenance Completed" },
    ],
  },
  Retirement: {
    description: "Retire the product safely, inform consumers, preserve required records, and close delivery ownership.",
    tasks: [
      { name: "Retirement Assessment" },
      { name: "Consumer Communication" },
      { name: "Data Retention Confirmation" },
      { name: "Access Decommissioning" },
      { name: "Retirement Completed" },
    ],
  },
};

const requestedProcesses = [
  { name: "C7", requestId: "TRD-2024-001", requestJira: "EXDPL-1041", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-001", title: "C7 Trading Data Product", dataProductType: "Create Regular IT Data Product", requester: "Natali Karlova-B.", domain: "Eurex Trading", businessJira: "EXDPL-1042", technicalJira: "EXDPL-1043", intent: "Create data product", stage: "Request Preparation", currentSubstep: "Complete template", sla: "Not submitted", decision: "No decision yet", updated: "Updated today", progress: 0, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Markus Meyer", itCounterpart: "Anna Müller", created: "May 14, 2024", action: "Complete request preparation" },
  { name: "MMPM", requestId: "GMP-2024-002", requestJira: "EXDPL-1044", atlanContractUrl: "https://atlan.example.com/contracts/GMP-2024-002", title: "MMPM Data Product", dataProductType: "Create Hybrid Data Product", requester: "Andreas Müller", domain: "Global Products and Markets", businessJira: "EXDPL-1045", technicalJira: "EXDPL-1046", intent: "Create data product (POC available)", stage: "Analysis & Design", currentSubstep: "Analysis Initiation", sla: "Due tomorrow", decision: "Awaiting input", updated: "Updated 2h ago", progress: 25, status: "Waiting", dataProductOwner: "Andreas Müller", domainOwner: "Sofia Weber", itCounterpart: "David Klein", created: "May 12, 2024", action: "Initiate analysis" },
  { name: "Reference Data", requestId: "CLR-2024-003", requestJira: "EXDPL-1047", atlanContractUrl: "https://atlan.example.com/contracts/CLR-2024-003", title: "Reference Data Retirement", dataProductType: "Request Retirement", requester: "Daniel Peters", domain: "Eurex Clearing", businessJira: "EXDPL-1048", technicalJira: "EXDPL-1049", intent: "Request retirement", stage: "Retirement", currentSubstep: "Retirement Completed", sla: "Completed", decision: "Approved", updated: "Updated May 6", progress: 100, status: "Completed", dataProductOwner: "Daniel Peters", domainOwner: "Sabine Keller", itCounterpart: "Felix Roth", created: "May 06, 2024", action: "Retirement Completed" },
  { name: "Orders & Quotes", requestId: "TRD-2024-004", requestJira: "EXDPL-1050", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-004", title: "Orders & Quotes Quality Issue", dataProductType: "Report Issue", requester: "Daniel Peters", domain: "Eurex Trading", businessJira: "EXDPL-1051", technicalJira: "EXDPL-1052", intent: "Report issue", stage: "Test & Deployment", currentSubstep: "In Test", sla: "1 day left", decision: "Awaiting approval", updated: "Updated today", progress: 75, status: "In Progress", dataProductOwner: "Daniel Peters", domainOwner: "Julia Fischer", itCounterpart: "Martin Bauer", created: "May 10, 2024", action: "Complete acceptance testing" },
  { name: "M2M", requestId: "RSK-2024-005", requestJira: "EXDPL-1053", atlanContractUrl: "https://atlan.example.com/contracts/RSK-2024-005", title: "M2M Product Enhancement", dataProductType: "Enhance Existing Data Product", requester: "Natali Karlova-B.", domain: "Eurex Risk", businessJira: "EXDPL-1054", technicalJira: "EXDPL-1055", intent: "Enhance existing data product", stage: "Build", currentSubstep: "Infrastructure Provisioning", sla: "5 days left", decision: "No decision yet", updated: "Updated yesterday", progress: 50, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Lena Hoffmann", itCounterpart: "Thomas Wagner", created: "May 08, 2024", action: "Provision infrastructure" },
  { name: "Market Data Portal", requestId: "GMP-2024-006", requestJira: "EXDPL-1056", atlanContractUrl: "https://atlan.example.com/contracts/GMP-2024-006", title: "Market Data Portal Self-Service Registration", dataProductType: "Register Self-Service Data Product", requester: "Sofia Weber", domain: "Global Products and Markets", businessJira: "EXDPL-1057", technicalJira: "EXDPL-1058", intent: "Register self-service data product", stage: "Analysis & Design", currentSubstep: "Requirements Completed & Prioritization", sla: "4 days left", decision: "Awaiting review", updated: "Updated today", progress: 25, status: "In Progress", dataProductOwner: "Sofia Weber", domainOwner: "Andreas Müller", itCounterpart: "David Klein", created: "May 16, 2024", action: "Prioritize requirements" },
  { name: "Legacy Risk Feed", requestId: "RSK-2024-007", requestJira: "EXDPL-1059", atlanContractUrl: "https://atlan.example.com/contracts/RSK-2024-007", title: "Legacy Risk Feed Retirement", dataProductType: "Request Retirement", requester: "Lena Hoffmann", domain: "Eurex Risk", businessJira: "EXDPL-1060", technicalJira: "EXDPL-1061", intent: "Request retirement", stage: "Inception & Scoping", currentSubstep: "Request Under Review", sla: "6 days left", decision: "Awaiting approval", updated: "Updated yesterday", progress: 0, status: "Waiting", dataProductOwner: "Lena Hoffmann", domainOwner: "Thomas Wagner", itCounterpart: "Felix Roth", created: "May 15, 2024", action: "Review request scope" },
] as const;

type RequestedProcess = (typeof requestedProcesses)[number];
const currentPortalUser = "Natali Karlova-B.";
const requestAssigneeByName: Record<string, string> = {
  C7: currentPortalUser,
  MMPM: "Andreas Müller",
  "Reference Data": "Daniel Peters",
  "Orders & Quotes": "Daniel Peters",
  M2M: currentPortalUser,
  "Market Data Portal": "Sofia Weber",
  "Legacy Risk Feed": "Lena Hoffmann",
};
export const pinnedRequestsChangedEvent = "dpl-pinned-requests-changed";
const pinnedRequestsStorageKey = "dpl-pinned-requests";

export function getPinnedRequestNames() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(pinnedRequestsStorageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((name): name is string => typeof name === "string") : [];
  } catch {
    return [];
  }
}

export function getRequestSummary(name: string | null) {
  if (!name) return undefined;
  const request = requestedProcesses.find((process) => process.name === name);
  return request ? { title: request.title, requestId: request.requestId, owner: request.requester } : undefined;
}

const completedAtByRequestId: Record<string, string> = {
  "CLR-2024-003": "2024-05-06",
};

function isArchivedRequest(request: RequestedProcess) {
  const completedAt = completedAtByRequestId[request.requestId];
  if (!completedAt) return false;
  const ageInDays = (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays >= 30;
}

export function PortalDashboard({ onOpenRequests }: { onOpenRequests: () => void }) {
  const activeRequests = requestedProcesses.filter((request) => !isArchivedRequest(request));
  const domainProductCounts = [
    { domain: requestDomains[0], count: 68 },
    { domain: requestDomains[1], count: 44 },
    { domain: requestDomains[2], count: 39 },
    { domain: requestDomains[3], count: 33 },
    { domain: requestDomains[4], count: 0 },
    { domain: requestDomains[5], count: 0 },
    { domain: requestDomains[6], count: 0 },
  ];
  const onboardedProducts = domainProductCounts.reduce((total, { count }) => total + count, 0);
  const inProgressRequests = activeRequests.filter((request) => request.status === "In Progress").length;
  const waitingRequests = activeRequests.filter((request) => request.status === "Waiting").length;
  const maxDomainCount = Math.max(...domainProductCounts.map(({ count }) => count), 1);
  const stageDurations = [
    { stage: "Inception & Scoping", days: 8 },
    { stage: "Analysis & Design", days: 17 },
    { stage: "Build", days: 22 },
    { stage: "Test & Deployment", days: 5 },
  ];
  const averageCreationDays = stageDurations.reduce((total, { days }) => total + days, 0);
  const longestStageDays = Math.max(...stageDurations.map(({ days }) => days));

  return <section className="dpl-panel dpl-portal-dashboard" aria-label="Data product dashboard">
    <div className="dpl-section-heading"><div><h2>Dashboard</h2><p>Data product onboarding and request activity at a glance.</p></div><button type="button" className="dpl-link-button" onClick={onOpenRequests}>View all requests</button></div>
    <div className="dpl-portal-dashboard-metrics">
      <article><span>Data products onboarded</span><strong>{onboardedProducts}</strong><small>Established product estate</small></article>
      <article><span>Open requests</span><strong>{activeRequests.length}</strong><small>Across all domains</small></article>
      <article><span>In progress</span><strong>{inProgressRequests}</strong><small>Currently being delivered</small></article>
      <article><span>Awaiting input or approval</span><strong>{waitingRequests}</strong><small>In-progress requests needing a response</small></article>
    </div>
    <section className="dpl-portal-dashboard-domains" aria-labelledby="dashboard-domains-heading">
      <div><h3 id="dashboard-domains-heading">Data products by domain</h3><span>All tracked requests</span></div>
      <div className="dpl-domain-bars">{domainProductCounts.map(({ domain, count }) => <div key={domain}><span>{domain}</span><div aria-label={`${domain}: ${count} onboarded data products`}><i style={{ width: `${(count / maxDomainCount) * 100}%` }} /></div><strong>{count}</strong></div>)}</div>
    </section>
    <section className="dpl-dashboard-duration" aria-labelledby="dashboard-duration-heading">
      <div className="dpl-dashboard-duration-heading"><div><h3 id="dashboard-duration-heading">Average data product creation time</h3><p>Inception through Deployment · Calendar days · Illustrative data</p></div><strong>{averageCreationDays}<small> days</small></strong></div>
      <div className="dpl-dashboard-stage-durations" aria-label="Average time per creation stage">
        {stageDurations.map(({ stage, days }) => <div key={stage}><span>{stage}</span><div className="dpl-dashboard-duration-track"><i style={{ width: `${days / longestStageDays * 100}%` }} /></div><strong>{days} days</strong></div>)}
      </div>
    </section>
  </section>;
}

function useTemplateDraft(storageKey: string, requestType?: string) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft || !formRef.current) return;
    const values = { ...JSON.parse(savedDraft) as Record<string, string>, ...(requestType ? { productType: requestType } : {}) };
    Object.entries(values).forEach(([name, value]) => {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (field) field.value = value;
    });
  }, [storageKey, requestType]);

  const persistDraft = () => {
    if (!formRef.current) return;
    const values = { ...Object.fromEntries(new FormData(formRef.current).entries()), ...(requestType ? { productType: requestType } : {}) };
    window.localStorage.setItem(storageKey, JSON.stringify(values));
    window.dispatchEvent(new Event("dpl-draft-content-changed"));
  };

  return { formRef, persistDraft };
}

function DraftSubmissionActions({ title, onSave, inline = false, disabled = false }: { title: string; onSave?: () => void; inline?: boolean; disabled?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submissionError, setSubmissionError] = useState("");

  return <>
    <button type="button" disabled={disabled} className={inline ? "dpl-new-conversation-button" : "dpl-business-case-submit"} onClick={() => { setSubmissionError(""); dialogRef.current?.showModal(); }}>Submit</button>
    <dialog ref={dialogRef} className="dpl-request-dialog dpl-submit-confirmation" aria-labelledby="draft-submit-title" aria-describedby="draft-submit-description">
      <div><h2 id="draft-submit-title">Submit {title}?</h2><p id="draft-submit-description">Are you sure you want to submit this template? Submission will create a Jira ticket and trigger the lifecycle process. Choose Keep editing to leave it as a draft.</p></div>
      <footer><button type="button" autoFocus onClick={() => dialogRef.current?.close()}>Keep editing</button><button type="button" className="dpl-business-case-submit" onClick={() => {
        onSave?.();
        dialogRef.current?.close();
        setSubmissionError("Submission is not connected to the lifecycle service yet. Your draft is saved; no Jira ticket has been created and no process has been triggered.");
      }}>Confirm submission</button></footer>
    </dialog>
    {submissionError && <p role="alert" className="dpl-request-workspace-note">{submissionError}</p>}
  </>;
}

function BusinessCaseTemplate({ businessCaseId, readOnly = false, intention, allowSubmission = true }: { businessCaseId: string; readOnly?: boolean; intention?: DraftIntention; allowSubmission?: boolean }) {
  const { formRef, persistDraft } = useTemplateDraft(`dpl-business-case-draft:${businessCaseId}`, intention);

  return (
    <section className="dpl-panel dpl-business-case" aria-label="One Pager">
      <div className="dpl-section-heading"><div><h2>One Pager</h2><p>{readOnly ? "Submitted Business Jira record." : "Capture the request before review in Inception & Scoping."}</p></div></div>
      <form ref={formRef} className="dpl-business-case-form" onInput={readOnly ? undefined : persistDraft}>
        <fieldset disabled={readOnly} className="dpl-one-pager-fields">
        <TemplateField label="Request Type" open><select name="productType" aria-label="Request Type" defaultValue={intention ?? ""} disabled={Boolean(intention)}><option value="" disabled>Select a type</option>{draftIntentions.map((value) => <option key={value}>{value}</option>)}</select></TemplateField>
        <TemplateField label="Ownership"><select name="ownership" aria-label="Ownership" defaultValue=""><option value="" disabled>Select a domain</option>{requestDomains.map((domain) => <option key={domain}>{domain}</option>)}</select></TemplateField>
        <TemplateField label="Purpose"><textarea name="purpose" aria-label="Purpose" rows={2} placeholder="Captured purpose" /></TemplateField>
        <TemplateField label="Contents"><textarea name="contents" aria-label="Contents" rows={2} placeholder="Captured entities" /></TemplateField>
        <TemplateField label="Existing Data Products"><textarea name="existingProducts" aria-label="Existing Data Products" rows={2} placeholder="Identified products or None" /></TemplateField>
        <TemplateField label="Reuse Assessment"><textarea name="reuseAssessment" aria-label="Reuse Assessment" rows={2} placeholder="Assessment findings" /></TemplateField>
        <TemplateField label="AI Recommendation"><input name="aiRecommendation" aria-label="AI Recommendation" defaultValue="" placeholder="Added after AI reuse assessment" readOnly /></TemplateField>
        <TemplateField label="Requester Justification"><input name="requesterJustification" aria-label="Requester Justification" placeholder="Required when applicable" /></TemplateField>
        <TemplateField label="Benefits"><textarea name="benefits" aria-label="Benefits" rows={2} placeholder="Business value, risk reduction, or operational efficiency" /></TemplateField>
        <TemplateField label="Primary Consumers"><input name="primaryConsumers" aria-label="Primary Consumers" placeholder="Business users or consuming systems" /></TemplateField>
        <TemplateField label="Distribution Channel"><select name="distributionChannel" aria-label="Distribution Channel" defaultValue=""><option value="" disabled>Select a channel</option><option>API</option><option>Dashboard</option><option>Report</option><option>Data Feed</option><option>File Delivery</option><option>Self-Service Access</option></select></TemplateField>
        <TemplateField label="Key Characteristics"><textarea name="keyCharacteristics" aria-label="Key Characteristics" rows={2} placeholder="Real-Time, End-of-Day, Regulatory, Reusable, Critical, Internal, External" /></TemplateField>
        <TemplateField label="Estimated Investment"><select name="investmentBracket" aria-label="Estimated Investment" defaultValue=""><option value="" disabled>Select an investment bracket</option><option>Less than EUR 50k</option><option>EUR 50k-EUR 200k</option><option>EUR 200k-EUR 500k</option><option>More than EUR 500k</option><option>Unknown</option></select></TemplateField>
        <TemplateField label="Business Sponsor"><input name="businessSponsor" aria-label="Business Sponsor" placeholder="VP, Director, or Head of Unit" /></TemplateField>
        </fieldset>
        {!readOnly && allowSubmission && <DraftSubmissionActions title="One Pager" onSave={persistDraft} />}
      </form>
    </section>
  );
}

const businessRequirementsSections = [
  { title: "Functional Requirements", description: "Data content, business entities, sources, transformations, outputs, and business value.", fields: ["DP Name (Business display name)", "Data Product Definition (Semantic narrative)", "Entities & Dimensions (Core business entities)", "Time Horizon & Freshness (Lookback window and update cadence)", "Granularity & Aggregation (Grain level)", "Source Data & Dependencies (Upstream applications and feeds)", "Transformations & Business Logic (Enrichment, mapping, calculation logic)", "Output Ports (Storage targets, views, tables, APIs)", "Output Format (Parquet, Delta Lake, JSON, CSV)", "Business Value Proposition (Measurable ROI or business impact)", "CADP Sub-Type"] },
  { title: "Non-Functional Requirements", description: "Performance, availability, quality, security, reliability, and scalability standards.", fields: ["System Availability SLO (% uptime)", "Availability Schedule", "Data Freshness SLO (Target latency from upstream event)", "Data Volume & Growth", "Query Performance Expectations (P95 response time thresholds)", "Quality Assurance (Validation methodology)", "Data Quality Criteria", "Data Classification", "Accessibility", "Access Control", "RTO & RPO", "Support Model", "Maturity & Complexity Rating"] },
  { title: "Operational Requirements", description: "Ownership, governance, operational maintenance, and compliance.", fields: ["Subdomain & Subdomain Owner", "Data Product Owner & Operations Owner", "Business Criticality", "Business Value Measures & KPIs", "Customization Level", "Delivery Modality", "Team RACI Matrix", "Project Timeline & Target Delivery Window", "Testing Strategy", "Operational Metrics & Telemetry", "Alert Thresholds & Escalation Matrix", "Schema Evolution & Versioning Strategy"] },
] as const;

function toFieldName(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function TemplateField({ label, children, open = false }: { label: string; children: ReactNode; open?: boolean }) {
  return <details className="dpl-template-field" open={open}><summary>{label}</summary><div className="dpl-template-field-content">{children}</div></details>;
}

const intentTemplates = {
  "self-service-registration": { title: "Self-Service Data Product Registration", description: "Register a business-owned data product for discovery and governed use.", fields: ["Data Product Name", "Business Owner", "Business Domain", "Purpose and Use Cases", "Data Location and Access Method"] },
  "product-enhancement": { title: "Data Product Enhancement", description: "Capture the requested change and its business and delivery impact.", fields: ["Existing Data Product", "Requested Change", "Business Rationale", "Dependencies and Impact", "Requested Priority"] },
  "issue-report": { title: "Data Product Issue Report", description: "Record an issue for investigation, triage, and resolution.", fields: ["Affected Data Product", "Issue Summary", "Business Impact", "Evidence or Example", "Severity"] },
  "retirement-request": { title: "Data Product Retirement Request", description: "Plan the controlled retirement of a data product.", fields: ["Data Product to Retire", "Retirement Reason", "Known Consumers", "Retention Requirements", "Proposed Retirement Date"] },
  "request-review": { title: "Data Product Request Review", description: "Assess the submitted request and document its next lifecycle action.", fields: ["Jira Ticket", "Request Summary", "Missing Information", "Risks and Dependencies", "Recommended Next Action"] },
} as const;

type IntentTemplate = (typeof intentTemplates)[keyof typeof intentTemplates];

function IntentTemplateForm({ businessCaseId, template, allowSubmission = false }: { businessCaseId: string; template: IntentTemplate; allowSubmission?: boolean }) {
  const { formRef, persistDraft } = useTemplateDraft(`dpl-intent-template-draft:${businessCaseId}`);

  return <section className="dpl-panel dpl-business-case" aria-label={`${template.title} template`}>
    <div className="dpl-section-heading"><div><h2>{template.title}</h2><p>{template.description}</p></div></div>
    <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
      {template.fields.map((label, index) => <TemplateField key={label} label={label} open={index === 0}><textarea name={toFieldName(label)} aria-label={label} rows={2} placeholder={`Add ${label.toLowerCase()}`} /></TemplateField>)}
      {allowSubmission && <DraftSubmissionActions title={template.title} onSave={persistDraft} />}
    </form>
  </section>;
}

function BusinessRequirementsTemplate({ businessCaseId }: { businessCaseId: string }) {
  const { formRef, persistDraft } = useTemplateDraft(`dpl-business-requirements-draft:${businessCaseId}`);

  return <section className="dpl-panel dpl-business-case" aria-label="Business Requirements Jira template">
    <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
      {businessRequirementsSections.map((section) => <div className="dpl-business-requirements-section" key={section.title}>
        <strong>{section.title}</strong><span>{section.description}</span>
        <div className="dpl-business-requirements-fields">{section.fields.map((label, index) => <TemplateField key={label} label={label} open={index === 0}><textarea name={toFieldName(label)} aria-label={label} rows={2} placeholder={`Add ${label.toLowerCase()}`} /></TemplateField>)}</div>
      </div>)}
      <div className="dpl-business-case-actions"><button type="button" className="dpl-business-case-submit">Save draft</button></div>
    </form>
  </section>;
}

const technicalDesignSections = [
  { title: "General Information", description: "General metadata and repository setup.", fields: ["Data Product Description & Full Name", "Business Domain & Delivery Team / Pod Name", "Business Owner & Databricks Catalog Name", "Additional Databricks Workspace Requirements", "GitHub Service Repository Name"] },
  { title: "GCP Infrastructure Requirements", description: "Google Cloud Platform infrastructure and storage topology.", fields: ["Data Product Classification: CADP", "GCP Data Product Name & Project ID", "User Group & IAM Role Bindings", "Databricks Enabled / Inbound Enabled / Outbound Enabled flags", "Required CADP Output Ports & Schema definitions", "Additional Network & Private Service Connect Requirements"] },
  { title: "DMG Requirements", description: "Data Mesh Governance automated metadata registration.", fields: ["Databricks Metadata Sync Configuration", "BigQuery Metadata Onboarding", "OpenLineage Lineage Extraction Configuration", "Additional Central DMG Governance Requirements"] },
  { title: "Operations Requirements", description: "Production readiness and alerting telemetry.", fields: ["Monitoring Required (Prometheus/Grafana/Cloud Monitoring)", "Alerting Required (PagerDuty / Slack / Email triggers)", "Operational Runbook Required (Failure recovery SOP)"] },
  { title: "Data Synchronization Requirements", description: "Data pipeline frequency and backfill parameters.", fields: ["Daily Synchronization Schedule", "Historical Data Load Flag", "Historical Load Start Year & End Year", "Partitioning Pattern & Clustering Keys"] },
  { title: "Source System Information", description: "Upstream lineage and ingestion sources.", fields: ["Source Systems & Application IDs", "Source Paths, Buckets, & API Endpoints", "Target Cloud Storage Buckets", "Control-M Scheduling Dependencies"] },
  { title: "Technical Requirements", description: "Technical engineering requirements.", fields: ["Source and Target Interfaces", "Data Ingestion & Storage Architecture", "Data Processing Logic & Transformation Layers", "Data Retention, Archival & Purging Policies", "Security, Encryption (CMEK), and Privacy Constraints"] },
] as const;

function TechnicalDesignTemplate({ businessCaseId }: { businessCaseId: string }) {
  const { formRef, persistDraft } = useTemplateDraft(`dpl-technical-design-draft:${businessCaseId}`);

  return <section className="dpl-panel dpl-business-case" aria-label="Technical Design Jira template">
    <div className="dpl-section-heading"><div><h2>Technical Design Jira</h2><p>Define implementation, infrastructure, governance, and operational readiness requirements.</p></div></div>
    <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
      {technicalDesignSections.map((section) => <div className="dpl-business-requirements-section" key={section.title}>
        <strong>{section.title}</strong><span>{section.description}</span>
        <div className="dpl-business-requirements-fields">{section.fields.map((label, index) => <TemplateField key={label} label={label} open={index === 0}><textarea name={toFieldName(label)} aria-label={label} rows={2} placeholder={`Add ${label.toLowerCase()}`} /></TemplateField>)}</div>
      </div>)}
      <div className="dpl-business-case-actions"><button type="button" className="dpl-business-case-submit">Save draft</button></div>
    </form>
  </section>;
}

type RequestScope = "current" | "assignedToMe" | "createdByMe" | "drafts" | "archive";

function RunningRequestsOverview({ selectedRequestName, onSelectRequest, scope }: { selectedRequestName: string | null; onSelectRequest: (name: string) => void; scope: Exclude<RequestScope, "drafts"> }) {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [requestTab, setRequestTab] = useState<"current" | "assignedToMe" | "createdByMe">(scope === "createdByMe" ? "createdByMe" : "current");
  const [pinnedRequestNames, setPinnedRequestNames] = useState<string[]>(getPinnedRequestNames);
  const resolvedScope = scope === "current" ? requestTab : scope;
  const scopedProcesses = resolvedScope === "archive"
    ? requestedProcesses.filter(isArchivedRequest)
    : requestedProcesses.filter((process) => !isArchivedRequest(process) && (resolvedScope !== "createdByMe" || process.requester === currentPortalUser) && (resolvedScope !== "assignedToMe" || requestAssigneeByName[process.name] === currentPortalUser));
  const isArchive = resolvedScope === "archive";
  const isCreatedByMe = resolvedScope === "createdByMe";
  const isAssignedToMe = resolvedScope === "assignedToMe";
  const statusProcesses = isArchive || selectedStatus === "All"
    ? scopedProcesses
    : scopedProcesses.filter((process) => (process.status === "Waiting" ? "In Progress" : process.status) === selectedStatus);
  const keyword = searchQuery.trim().toLowerCase();
  const visibleProcesses = statusProcesses.filter((process) => Object.values(process).some((value) => String(value).toLowerCase().includes(keyword)));
  const togglePinnedRequest = (requestName: string) => {
    setPinnedRequestNames((current) => {
      const next = current.includes(requestName) ? current.filter((name) => name !== requestName) : [...current, requestName];
      window.localStorage.setItem(pinnedRequestsStorageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(pinnedRequestsChangedEvent));
      return next;
    });
  };

  return (
    <section className="dpl-panel dpl-running-overview" aria-label="Running requests overview">
      {scope === "current" && <div className="dpl-request-scope-tabs" role="tablist" aria-label="Request scope"><button type="button" role="tab" aria-selected={requestTab === "current"} className={requestTab === "current" ? "active" : ""} onClick={() => setRequestTab("current")}>All</button><button type="button" role="tab" aria-selected={requestTab === "createdByMe"} className={requestTab === "createdByMe" ? "active" : ""} onClick={() => setRequestTab("createdByMe")}>Created by me</button></div>}
      <div className="dpl-section-heading"><div><h2>{isArchive ? "Archive" : isAssignedToMe ? "Assigned to me" : isCreatedByMe ? "Created by me" : "All requests"}</h2><p>{isArchive ? "Completed, cancelled, rejected, and retired requests retained for reference." : isAssignedToMe ? "Requests with Jira work currently assigned to you." : isCreatedByMe ? "Requests you created in the portal." : "Track in-progress and recently completed requests."}</p></div><div className="dpl-overview-header-note"><Info size={14} /><span>Select a request to open its workspace, including lifecycle and Jira tickets.</span></div></div>
      <div className="dpl-request-list-toolbar">
      {!isArchive && <div className="dpl-process-tabs" aria-label="Request status filter">
        {['All', 'Draft', 'In Progress', 'Completed'].map((tab) => (
          <button key={tab} type="button" className={tab === selectedStatus ? "active" : ""} onClick={() => setSelectedStatus(tab)}>{tab}</button>
        ))}
      </div>}
      <RequestSearch value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className="dpl-overview-list" aria-label="Request records">
        {!isArchive && !isAssignedToMe && (selectedStatus === "All" || selectedStatus === "Draft") && <DraftsOverview embedded searchQuery={searchQuery} />}
        {keyword && visibleProcesses.length === 0 && <p role="status" className="dpl-sidebar-empty">No submitted requests match this keyword.</p>}
        {visibleProcesses.map((request) => (
          <div className={`dpl-overview-request ${request.name === selectedRequestName ? "dpl-selected-request" : ""}`} key={request.name} role="button" tabIndex={0} onClick={() => onSelectRequest(request.name)} onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelectRequest(request.name);
            }
          }}>
            <div className="dpl-request-record-title"><div><strong>{request.title}</strong><span className={`dpl-table-status ${request.status === "Waiting" ? "in-progress" : request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status === "Waiting" ? "In Progress" : request.status}</span></div><div className="dpl-request-record-actions"><RequestAccessButton requestName={request.name} requestTitle={request.title} owner={request.requester} /><button type="button" className="dpl-request-pin" onClick={(event) => { event.stopPropagation(); togglePinnedRequest(request.name); }} title={pinnedRequestNames.includes(request.name) ? "Unpin request" : "Pin request"} aria-label={pinnedRequestNames.includes(request.name) ? `Unpin ${request.title}` : `Pin ${request.title}`}>{pinnedRequestNames.includes(request.name) ? <PinOff size={14} /> : <Pin size={14} />}</button></div></div>
            <div className="dpl-request-record-cell dpl-request-record-id"><span>Request ID</span><strong>{request.requestId}</strong></div>
            <div className="dpl-request-record-cell dpl-request-record-type"><span>Request Type</span><strong>{request.dataProductType}</strong></div>
            <div className="dpl-request-record-cell"><span>Requester</span><strong>{request.requester}</strong></div>
            <div className="dpl-request-record-cell"><span>Domain</span><strong>{request.domain}</strong></div>
            <div className="dpl-request-record-cell"><span>Creation Date</span><strong>{request.created}</strong></div>
            <div className="dpl-request-record-cell dpl-request-record-atlan"><span>Atlan Contract</span><a href={request.atlanContractUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Open contract <ExternalLink size={12} aria-hidden="true" /></a></div>
            <div className="dpl-request-record-cell dpl-request-record-jiras"><span>Jira Tickets</span><div><b>Request</b><a href={`https://devopsjira.deutsche-boerse.com/browse/${request.requestJira}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{request.requestJira}<ExternalLink size={11} aria-hidden="true" /></a></div><div><b>Business requirements</b><a href={`https://devopsjira.deutsche-boerse.com/browse/${request.businessJira}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{request.businessJira}<ExternalLink size={11} aria-hidden="true" /></a></div><div><b>Technical design</b><a href={`https://devopsjira.deutsche-boerse.com/browse/${request.technicalJira}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{request.technicalJira}<ExternalLink size={11} aria-hidden="true" /></a></div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <form className="dpl-request-search" role="search" aria-label="Search requests" onSubmit={(event) => event.preventDefault()}><input type="search" aria-label="Search requests by keyword" placeholder="Search requests" value={value} onChange={(event) => onChange(event.target.value)} /><button type="submit" aria-label="Search requests" title="Search requests"><Search size={16} aria-hidden="true" /></button></form>;
}

function DraftsOverview({ embedded = false, searchQuery = "" }: { embedded?: boolean; searchQuery?: string }) {
  const [drafts, setDrafts] = useState<ThreadMetadata[]>([]);
  const [draftSearch, setDraftSearch] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<ThreadMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState("");

  const removeDraft = async () => {
    if (!pendingDeletion || deleting) return;
    setDeleting(true);
    setDeletionError("");
    try {
      const ids = JSON.parse(localStorage.getItem(businessCaseIdsStorageKey) ?? "{}") as Record<string, string>;
      const intents = JSON.parse(localStorage.getItem("dpl-business-case-intents") ?? "{}") as Record<string, string>;
      const draftIds = new Set([pendingDeletion.remoteId]);
      const threads = await listThreads();
      let previousSize = 0;
      while (previousSize !== draftIds.size) {
        previousSize = draftIds.size;
        for (const thread of threads) {
          if (thread.parentThreadId && draftIds.has(thread.parentThreadId)) draftIds.add(thread.remoteId);
        }
      }
      for (const threadId of draftIds) {
        const thread = threads.find((item) => item.remoteId === threadId);
        await deleteThread(thread?.id ?? threadId);
        const formId = ids[threadId];
        if (formId) {
          for (const prefix of ["dpl-business-case-draft", "dpl-intent-template-draft", "dpl-business-requirements-draft", "dpl-technical-design-draft"]) localStorage.removeItem(`${prefix}:${formId}`);
        }
        localStorage.removeItem(conversationStorageKey(`draft:${threadId}`));
        localStorage.removeItem(conversationMessagesStorageKey(`draft:${threadId}`));
        localStorage.removeItem(`dpl-request-intake-conversation:draft:${threadId}`);
        const templatesKey = `dpl-conversation-templates:draft:${threadId}`;
        const templates = JSON.parse(localStorage.getItem(templatesKey) ?? "{}") as Record<string, DraftConversationTemplate>;
        const sharedTemplateKey = `dpl-draft-template:draft:${threadId}`;
        const sharedTemplate = JSON.parse(localStorage.getItem(sharedTemplateKey) ?? "null") as DraftConversationTemplate | null;
        for (const template of [...Object.values(templates), ...(sharedTemplate ? [sharedTemplate] : [])]) {
          localStorage.removeItem(`dpl-business-case-draft:${template.id}`);
          localStorage.removeItem(`dpl-intent-template-draft:${template.id}`);
        }
        localStorage.removeItem(templatesKey);
        localStorage.removeItem(sharedTemplateKey);
        delete ids[threadId];
        delete intents[threadId];
      }
      localStorage.setItem(businessCaseIdsStorageKey, JSON.stringify(ids));
      localStorage.setItem("dpl-business-case-intents", JSON.stringify(intents));
      window.dispatchEvent(new CustomEvent("dpl-drafts-deleted", { detail: { threadIds: [...draftIds] } }));
      setDrafts((current) => current.filter((draft) => !draftIds.has(draft.remoteId)));
      setPendingDeletion(null);
    } catch {
      setDeletionError("The draft could not be completely removed. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const refresh = async () => {
      const businessCaseIds = JSON.parse(window.localStorage.getItem(businessCaseIdsStorageKey) ?? "{}") as Record<string, string>;
      const threads = await listThreads();
      setDrafts(threads.filter((thread) => thread.status === "regular" && Boolean(businessCaseIds[thread.remoteId])));
    };
    void refresh();
    window.addEventListener(threadsChangedEvent, refresh);
    return () => window.removeEventListener(threadsChangedEvent, refresh);
  }, []);

  const keyword = (embedded ? searchQuery : draftSearch).trim().toLowerCase();
  const visibleDrafts = drafts.filter((draft) => {
    if (!keyword) return true;
    const template = JSON.parse(window.localStorage.getItem(`dpl-draft-template:draft:${draft.remoteId}`) ?? "null") as DraftConversationTemplate | null;
    const prefix = template && draftIntentionTemplates[template.intention] ? "dpl-intent-template-draft" : "dpl-business-case-draft";
    const values = template ? JSON.parse(window.localStorage.getItem(`${prefix}:${template.id}`) ?? "{}") as Record<string, string> : {};
    return [draft.title ?? "Untitled request", draft.remoteId, "Draft", "Request Preparation", template?.intention ?? "", ...Object.values(values)].some((value) => value.toLowerCase().includes(keyword));
  });

  return <section className={embedded ? undefined : "dpl-panel dpl-running-overview"} style={embedded ? { display: "contents" } : undefined} aria-label="Preparation requests">
    {!embedded && <div className="dpl-section-heading"><div><h2>Requests</h2><p>Continue preparing your requests before submission.</p></div></div>}
    {!embedded && <RequestSearch value={draftSearch} onChange={setDraftSearch} />}
    <div className={embedded ? undefined : "dpl-overview-list"} style={embedded ? { display: "contents" } : undefined} aria-label="Preparation request records">
      {visibleDrafts.length === 0 ? ((keyword || !embedded) && <p role="status" className="dpl-sidebar-empty">{keyword ? "No drafts match this keyword." : "No requests yet."}</p>) : visibleDrafts.map((draft) => <div role="button" tabIndex={0} className="dpl-overview-request dpl-draft-request" key={draft.remoteId} onClick={() => window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId: draft.remoteId } }))} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId: draft.remoteId } })); } }}>
        <div className="dpl-request-record-title"><div><strong>{draft.title ?? "Untitled request"}</strong><span className="dpl-table-status waiting">Draft</span></div><div className="dpl-request-record-actions"><RequestAccessButton requestName={`draft:${draft.remoteId}`} requestTitle={draft.title ?? "Untitled request"} owner={currentPortalUser} /><button type="button" className="dpl-request-access-button" title="Delete draft" aria-label={`Delete draft ${draft.title ?? "Untitled request"}`} onClick={(event) => { event.stopPropagation(); setDeletionError(""); setPendingDeletion(draft); }}><Trash2 size={14} /></button></div></div>
        <div className="dpl-request-record-cell"><span>Intake conversation</span><strong>Open draft</strong></div>
        <div className="dpl-request-record-cell"><span>Stage</span><strong>Request Preparation</strong></div>
        <div className="dpl-request-record-cell"><span>Submission readiness</span><strong>{getDraftReadiness(JSON.parse(window.localStorage.getItem(`dpl-draft-template:draft:${draft.remoteId}`) ?? "null") as DraftConversationTemplate | null).label}</strong></div>
        <div className="dpl-request-record-cell"><span>Created</span><strong>{new Date(draft.createdAt).toLocaleDateString()}</strong></div>
      </div>)}
    </div>
    {pendingDeletion && <div className="dpl-request-dialog-backdrop" role="presentation"><section className="dpl-request-dialog dpl-conversation-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-draft-title"><div><p className="dpl-conversation-delete-dialog-label">Permanent action</p><h2 id="delete-draft-title">Delete draft?</h2><p><strong>{pendingDeletion.title ?? "Untitled request"}</strong>, its conversations, messages, and saved forms will be permanently deleted. This cannot be undone.</p>{deletionError && <p role="alert">{deletionError}</p>}</div><footer><button type="button" disabled={deleting} onClick={() => setPendingDeletion(null)}>Cancel</button><button type="button" className="dpl-conversation-delete-confirm" disabled={deleting} onClick={() => void removeDraft()}>{deleting ? "Deleting..." : "Delete draft"}</button></footer></section></div>}
  </section>;
}

export function RequestWorkspace({ scope, selectedRequestName, onSelectRequest }: { scope: RequestScope; selectedRequestName: string | null; onSelectRequest: (name: string) => void }) {
  return scope === "drafts" ? <DraftsOverview /> : <RunningRequestsOverview scope={scope} selectedRequestName={selectedRequestName} onSelectRequest={onSelectRequest} />;
}

export function DraftWorkspace({ draftId, onBack }: { draftId: string; onBack: () => void }) {
  const [draftTitle, setDraftTitle] = useState("Untitled request");
  const [draftView, setDraftView] = useState<"progress" | "template" | "intent">("progress");

  useEffect(() => {
    let active = true;
    setDraftTitle("Untitled request");
    setDraftView("progress");
    const refresh = async () => {
      const draft = await getThread(draftId);
      if (active) setDraftTitle(draft?.title?.trim() || "Untitled request");
    };
    void refresh();
    window.addEventListener(threadsChangedEvent, refresh);
    return () => {
      active = false;
      window.removeEventListener(threadsChangedEvent, refresh);
    };
  }, [draftId]);

  return <section className="dpl-draft-workspace" aria-label="Draft request workspace">
    <nav className="dpl-main-window-request-identity" aria-label="Draft path"><button type="button" onClick={onBack}><ArrowLeft size={13} />Requests</button><span aria-hidden="true">/</span><em aria-current="page" title={`Workspace: ${draftTitle}`}>Workspace: {draftTitle}</em><span className="dpl-table-status waiting">Draft</span></nav>
    <div className="dpl-draft-workspace-content">
      <RequestConversationsWorkspace key={draftId} requestName={`draft:${draftId}`} allowDeletion renderTemplate={(template, selectIntention) => <aside id="dpl-draft-editor" className="dpl-panel dpl-workspace-shell dpl-draft-template-editor dpl-draft-intent-picker" aria-label="Draft documents">
        {draftView !== "progress" && <div className="dpl-section-heading dpl-draft-document-heading">
          <h2>{draftView === "intent" ? "Request type" : "Template"}</h2>
          <button type="button" className="dpl-conversations-back" onClick={() => setDraftView("progress")}><ArrowLeft size={14} aria-hidden="true" />Back to Lifecycle Tracker</button>
        </div>}
        <div style={{ display: draftView === "progress" ? "flex" : "none", flex: "1 1 0", minHeight: 0 }}>
          <CurrentProcess key={draftId} embedded request={{ stage: "Request Preparation", status: "In Progress", currentSubstep: "Complete template", dataProductType: template?.intention ?? "Not selected" }} preparationTemplate={template} viewControls={{ heading: <h2>Lifecycle Tracker</h2>, onSelectIntent: () => setDraftView("intent"), onOpenPreparation: () => { if (template) setDraftView("template"); }, onOpenBusiness: () => setDraftView("template"), onOpenStxad: () => setDraftView("template") }} />
        </div>
        <div style={{ display: draftView === "template" ? "contents" : "none" }}>
        {template ? <>
        {draftIntentionTemplates[template.intention]
          ? <IntentTemplateForm key={template.id} businessCaseId={template.id} template={draftIntentionTemplates[template.intention]!} />
          : <BusinessCaseTemplate key={template.id} businessCaseId={template.id} intention={template.intention} allowSubmission={false} />}
        </> : null}
        </div>
        {draftView === "intent" && <div className="dpl-draft-intent-picker-body"><div className="dpl-draft-intent-content"><p className="dpl-draft-intent-introduction">Already know what you need? Choose a request type below. Not sure yet? Discuss your request with the AI in chat first.</p><div className="dpl-draft-conversation-intentions" aria-label="Request types">{draftConversationIntentions.map((intention) => <button type="button" key={intention} aria-label={intention} aria-describedby={`draft-intent-${toFieldName(intention)}`} onClick={() => { selectIntention(intention); setDraftView("template"); }}><span>{intention}</span><IntentInfo intention={intention} id={`draft-intent-${toFieldName(intention)}`} /></button>)}</div></div></div>}
      </aside>} />
    </div>
  </section>;
}

function conversationStorageKey(requestName: string) {
  return `dpl-request-conversations:${requestName}`;
}

function conversationMessagesStorageKey(requestName: string) {
  return `dpl-request-conversation-messages:${requestName}`;
}

const intakeConversationTitle = "Intake & Discovery Conversation (audit record)";
const draftConversationIntentions = draftIntentions;

const intentDescriptions: Record<DraftIntention, string> = {
  "Create Regular IT Data Product": "Request a new data product to be designed, built, and operated by an IT delivery team.",
  "Create Hybrid Data Product": "Request a data product that builds on an existing business prototype or proof of concept with IT delivery support.",
  "Register Self-Service Data Product": "Register a data product created and maintained by your business team for discovery and governance.",
  "Enhance Existing Data Product": "Request changes to an existing data product, such as new data, features, or distribution channels.",
  "Report Issue": "Report a problem with an existing data product, such as missing data, incorrect results, or availability.",
  "Request Retirement": "Request that an existing data product be decommissioned, with its consumers and dependencies assessed first.",
};

function IntentInfo({ intention, id }: { intention: DraftIntention; id: string }) {
  return <span className="dpl-intent-info"><Info size={14} aria-hidden="true" /><span id={id} role="tooltip" className="dpl-intent-tooltip">{intentDescriptions[intention]}</span></span>;
}
type DraftConversationTemplate = { intention: DraftIntention; id: string };
function getDraftReadiness(template: DraftConversationTemplate | null) {
  if (!template) return { label: "Needs request type", missing: [] as string[] };
  const intentTemplate = draftIntentionTemplates[template.intention];
  const fields = intentTemplate
    ? intentTemplate.fields.map((label) => ({ name: toFieldName(label), label }))
    : [
      { name: "ownership", label: "Ownership" },
      { name: "purpose", label: "Purpose" },
      { name: "contents", label: "Contents" },
      { name: "benefits", label: "Benefits" },
      { name: "primaryConsumers", label: "Primary Consumers" },
      { name: "businessSponsor", label: "Business Sponsor" },
    ];
  const prefix = intentTemplate ? "dpl-intent-template-draft" : "dpl-business-case-draft";
  const values = JSON.parse(window.localStorage.getItem(`${prefix}:${template.id}`) ?? "{}") as Record<string, string>;
  const missing = fields.filter(({ name }) => !values[name]?.trim()).map(({ label }) => label);
  return { label: missing.length ? "Needs information" : "Ready for review", missing };
}

const draftIntentionTemplates: Partial<Record<DraftIntention, IntentTemplate>> = {
  "Register Self-Service Data Product": intentTemplates["self-service-registration"],
  "Enhance Existing Data Product": intentTemplates["product-enhancement"],
  "Report Issue": intentTemplates["issue-report"],
  "Request Retirement": intentTemplates["retirement-request"],
};

export function RequestConversationsWorkspace({ requestName, allowDeletion = false, editorVisible, onToggleEditor, onTemplateChange, onIntentionSelected, renderTemplate }: { requestName: string; allowDeletion?: boolean; editorVisible?: boolean; onToggleEditor?: () => void; onTemplateChange?: (template: DraftConversationTemplate | null) => void; onIntentionSelected?: () => void; renderTemplate?: (template: DraftConversationTemplate | null, selectIntention: (intention: DraftIntention) => void) => ReactNode }) {
  const [conversations, setConversations] = useState<string[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, IntakeMessage[]>>({});
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const assistantRequestRef = useRef<AbortController | null>(null);
  const [messageText, setMessageText] = useState("");
  const messageInputRef = useRef<HTMLInputElement>(null);
  const isDraftConversation = requestName.startsWith("draft:");
  const defaultIntakeTitle = isDraftConversation ? "Intake & Discovery" : intakeConversationTitle;
  const [renamingConversation, setRenamingConversation] = useState<string | null>(null);
  const [conversationName, setConversationName] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<string | null>(null);
  const [intakeConversation, setIntakeConversation] = useState(intakeConversationTitle);
  const intakeStorageKey = `dpl-request-intake-conversation:${requestName}`;
  const templatesStorageKey = `dpl-conversation-templates:${requestName}`;
  const [conversationTemplates, setConversationTemplates] = useState<Record<string, DraftConversationTemplate>>({});
  const draftTemplateStorageKey = `dpl-draft-template:${requestName}`;
  const [draftTemplate, setDraftTemplate] = useState<DraftConversationTemplate | null>(null);

  useEffect(() => {
    setAssistantBusy(false);
    setAssistantError("");
    return () => assistantRequestRef.current?.abort();
  }, [requestName, selectedConversation]);

  useEffect(() => {
    onTemplateChange?.(isDraftConversation ? draftTemplate : selectedConversation ? conversationTemplates[selectedConversation] ?? null : null);
  }, [selectedConversation, conversationTemplates, draftTemplate, isDraftConversation, onTemplateChange]);

  useEffect(() => {
    const saved = window.localStorage.getItem(conversationStorageKey(requestName));
    const loaded = saved ? JSON.parse(saved) as string[] : [defaultIntakeTitle, ...(!isDraftConversation ? requestWorkingConversations : [])];
    const previousPreparationTitle = "STXAD Creation";
    const preparationTitle = "STXAD Jira Ticket Preparation";
    const migratePreparation = !isDraftConversation && loaded.includes(previousPreparationTitle) && !loaded.includes(preparationTitle);
    if (migratePreparation) loaded[loaded.indexOf(previousPreparationTitle)] = preparationTitle;
    if (!isDraftConversation && !window.localStorage.getItem(`dpl-request-working-conversations:${requestName}`)) {
      for (const conversation of requestWorkingConversations) {
        if (!loaded.includes(conversation)) loaded.push(conversation);
      }
      window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(loaded));
      window.localStorage.setItem(`dpl-request-working-conversations:${requestName}`, "initialized");
    }
    const savedMessages = window.localStorage.getItem(conversationMessagesStorageKey(requestName));
    const storedMessages = savedMessages ? JSON.parse(savedMessages) as Record<string, Array<string | IntakeMessage>> : {};
    const loadedMessages = Object.fromEntries(Object.entries(storedMessages).map(([conversation, entries]) =>
      [conversation, entries.map((message): IntakeMessage => typeof message === "string" ? { role: "user", content: message } : message)]));
    if (migratePreparation) {
      loadedMessages[preparationTitle] = loadedMessages[previousPreparationTitle] ?? [];
      delete loadedMessages[previousPreparationTitle];
      window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(loaded));
      window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(loadedMessages));
    }
    let intakeName = window.localStorage.getItem(intakeStorageKey) ?? (loaded.includes("Intake conversation") ? "Intake conversation" : loaded.includes(intakeConversationTitle) ? intakeConversationTitle : defaultIntakeTitle);
    if ((intakeName === "Intake conversation" || intakeName === intakeConversationTitle) && intakeName !== defaultIntakeTitle && loaded.includes(intakeName) && !loaded.includes(defaultIntakeTitle)) {
      loaded[loaded.indexOf(intakeName)] = defaultIntakeTitle;
      loadedMessages[defaultIntakeTitle] = [...(loadedMessages[defaultIntakeTitle] ?? []), ...(loadedMessages[intakeName] ?? [])];
      delete loadedMessages[intakeName];
      intakeName = defaultIntakeTitle;
      window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(loaded));
      window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(loadedMessages));
      window.localStorage.setItem(intakeStorageKey, intakeName);
    }
    setConversations(loaded);
    const savedTemplates = window.localStorage.getItem(templatesStorageKey);
    const loadedTemplates = savedTemplates ? JSON.parse(savedTemplates) as Record<string, DraftConversationTemplate> : {};
    if (migratePreparation && loadedTemplates[previousPreparationTitle]) {
      loadedTemplates[preparationTitle] = loadedTemplates[previousPreparationTitle];
      delete loadedTemplates[previousPreparationTitle];
      window.localStorage.setItem(templatesStorageKey, JSON.stringify(loadedTemplates));
    }
    setConversationTemplates(loadedTemplates);
    const savedDraftTemplate = window.localStorage.getItem(draftTemplateStorageKey);
    const legacyTemplates = Object.values(loadedTemplates);
    const sharedTemplate = savedDraftTemplate ? JSON.parse(savedDraftTemplate) as DraftConversationTemplate : loadedTemplates[intakeName] ?? (legacyTemplates.length === 1 ? legacyTemplates[0] ?? null : null);
    setDraftTemplate(isDraftConversation ? sharedTemplate : null);
    if (isDraftConversation) {
      const hadIntake = loaded.includes(intakeName);
      if (intakeName === "Intake conversation" || intakeName === intakeConversationTitle) {
        loadedMessages[defaultIntakeTitle] = [...(loadedMessages[defaultIntakeTitle] ?? []), ...(loadedMessages[intakeName] ?? [])];
        delete loadedMessages[intakeName];
        const oldIntakeIndex = loaded.indexOf(intakeName);
        if (oldIntakeIndex >= 0) loaded.splice(oldIntakeIndex, 1);
        intakeName = defaultIntakeTitle;
      }
      if ((!saved || hadIntake) && !loaded.includes(intakeName)) loaded.unshift(intakeName);
      window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(loaded));
      window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(loadedMessages));
      window.localStorage.setItem(intakeStorageKey, intakeName);
      if (sharedTemplate) window.localStorage.setItem(draftTemplateStorageKey, JSON.stringify(sharedTemplate));
    }
    setIntakeConversation(intakeName);
    setConversationPendingDeletion(null);
    setSelectedConversation(null);
    setMessages(loadedMessages);
    setMessageText("");
    setRenamingConversation(null);
    setConversationName("");
    setConversationSearch("");
  }, [requestName, intakeStorageKey, defaultIntakeTitle, templatesStorageKey, draftTemplateStorageKey, isDraftConversation]);

  const isReadOnlyIntake = !isDraftConversation && selectedConversation === intakeConversation;

  const createConversation = () => {
    let conversationNumber = conversations.length + 1;
    while (conversations.includes(`Conversation ${conversationNumber}`)) conversationNumber += 1;
    const next = [...conversations, isDraftConversation && !conversations.includes(intakeConversation) ? intakeConversation : `Conversation ${conversationNumber}`];
    setConversations(next);
    setSelectedConversation(next.at(-1) ?? null);
    window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(next));
  };

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = messageText.trim();
    if (!message || !selectedConversation || assistantBusy || isReadOnlyIntake) return;
    const history: IntakeMessage[] = [...(messages[selectedConversation] ?? []), { role: "user", content: message }];
    const nextMessages = { ...messages, [selectedConversation]: history };
    setMessages(nextMessages);
    setMessageText("");
    window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
    if (!isDraftConversation) return;
    const controller = new AbortController();
    assistantRequestRef.current = controller;
    setAssistantBusy(true);
    setAssistantError("");
    try {
      const settings = await loadSettings();
      if (controller.signal.aborted) return;
      const response = await fetch("/api/draft-intake", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-LLM-Provider": settings.provider,
          "X-LLM-Model": settings.model,
          "X-LLM-API-Key": settings.apiKey,
          ...(settings.baseUrl ? { "X-LLM-Base-URL": settings.baseUrl } : {}),
        },
        body: JSON.stringify({
          messages: history.slice(-100).map(({ role, content }) => ({ role, content })),
          intention: draftTemplate?.intention,
          isIntake: selectedConversation === intakeConversation,
        }),
      });
      if (!response.ok) throw new Error(`The assistant could not respond (${response.status}). Check the provider settings and try again.`);
      const result = await response.json() as IntakeResponse;
      if (controller.signal.aborted) return;
      if (typeof result.reply !== "string" || (result.proposedIntention != null && !draftIntentions.includes(result.proposedIntention))) {
        throw new Error("The assistant returned an invalid response. Your message is saved.");
      }
      const completedMessages = { ...nextMessages, [selectedConversation]: [...history, { role: "assistant" as const, content: result.reply, proposedIntention: result.proposedIntention }] };
      window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(completedMessages));
      setMessages(completedMessages);
    } catch (error) {
      if (!controller.signal.aborted) setAssistantError(error instanceof Error ? error.message : "The assistant is unavailable. Your message is saved.");
    } finally {
      if (!controller.signal.aborted) setAssistantBusy(false);
    }
  };

  const selectIntention = (intention: DraftIntention) => {
    if (!isDraftConversation) return;
    assistantRequestRef.current?.abort();
    setAssistantBusy(false);
    setAssistantError("");
    const ids = JSON.parse(window.localStorage.getItem(businessCaseIdsStorageKey) ?? "{}") as Record<string, string>;
    const template = { intention, id: draftTemplate?.id ?? ids[requestName.slice("draft:".length)] ?? `draft-template-${crypto.randomUUID()}` };
    window.localStorage.setItem(draftTemplateStorageKey, JSON.stringify(template));
    setDraftTemplate(template);
    onTemplateChange?.(template);
    onIntentionSelected?.();
    if (selectedConversation) {
      const nextMessages = { ...messages, [selectedConversation]: [...(messages[selectedConversation] ?? []), { role: "user" as const, content: intention }] };
      setMessages(nextMessages);
      window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
    }
    messageInputRef.current?.focus();
  };

  const saveConversationName = () => {
    const nextName = conversationName.trim();
    if (!renamingConversation || (!isDraftConversation && renamingConversation === intakeConversation) || !nextName || nextName === renamingConversation || conversations.includes(nextName)) {
      setRenamingConversation(null);
      return;
    }
    const nextConversations = conversations.map((conversation) => conversation === renamingConversation ? nextName : conversation);
    const { [renamingConversation]: renamedMessages, ...remainingMessages } = messages;
    const nextMessages = { ...remainingMessages, ...(renamedMessages ? { [nextName]: renamedMessages } : {}) };
    setConversations(nextConversations);
    setMessages(nextMessages);
    setRenamingConversation(null);
    if (renamingConversation === intakeConversation) {
      setIntakeConversation(nextName);
      window.localStorage.setItem(intakeStorageKey, nextName);
    }
    const { [renamingConversation]: renamedTemplate, ...remainingTemplates } = conversationTemplates;
    const nextTemplates = { ...remainingTemplates, ...(renamedTemplate ? { [nextName]: renamedTemplate } : {}) };
    setConversationTemplates(nextTemplates);
    window.localStorage.setItem(templatesStorageKey, JSON.stringify(nextTemplates));
    window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(nextConversations));
    window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
  };

  const deleteConversation = (conversation: string) => {
    if (!allowDeletion || (!isDraftConversation && conversation === intakeConversation)) return;
    const { [conversation]: removedTemplate, ...nextTemplates } = conversationTemplates;
    if (removedTemplate && removedTemplate.id !== draftTemplate?.id) {
      window.localStorage.removeItem(`dpl-business-case-draft:${removedTemplate.id}`);
      window.localStorage.removeItem(`dpl-intent-template-draft:${removedTemplate.id}`);
    }
    setConversationTemplates(nextTemplates);
    window.localStorage.setItem(templatesStorageKey, JSON.stringify(nextTemplates));
    const nextConversations = conversations.filter((item) => item !== conversation);
    const { [conversation]: removedMessages, ...nextMessages } = messages;
    setConversations(nextConversations);
    setMessages(nextMessages);
    setSelectedConversation((selected) => selected === conversation ? null : selected);
    window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(nextConversations));
    window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
    setConversationPendingDeletion(null);
  };

  const visibleConversations = conversations.filter((conversation) => conversation.toLowerCase().includes(conversationSearch.trim().toLowerCase()));
  const templatePanel = renderTemplate?.(draftTemplate, selectIntention);

  if (selectedConversation) {
    const conversationMessages = messages[selectedConversation] ?? [];
    const conversationTitle = selectedConversation === intakeConversation && selectedConversation === defaultIntakeTitle ? "Intake & Discovery Conversation" : selectedConversation;
    return <><section className="dpl-panel dpl-request-conversations dpl-request-chat" aria-label={`${conversationTitle} chat`}>
      <div className="dpl-section-heading dpl-conversations-heading"><div><button type="button" className="dpl-conversations-back" onClick={() => setSelectedConversation(null)}><ArrowLeft size={14} /> All conversations</button><h2>{conversationTitle}</h2></div>{isDraftConversation && onToggleEditor && <button type="button" className="dpl-draft-editor-toggle" aria-expanded={editorVisible} aria-controls={editorVisible ? "dpl-draft-editor" : undefined} title={editorVisible ? "Hide editor" : "Show editor"} onClick={onToggleEditor}>{editorVisible ? <EyeOff size={14} /> : <Eye size={14} />}<span>{editorVisible ? "Hide editor" : "Show editor"}</span></button>}</div>
      <div className="dpl-request-chat-messages" aria-live="polite">
        {isDraftConversation && selectedConversation === intakeConversation && draftTemplate && <p className="dpl-request-workspace-note">Request type: {draftTemplate.intention}</p>}
        {isDraftConversation && <div className="dpl-draft-conversation-welcome">
          <p>Hi, I am your Data Product Lifecycle assistant. Tell me, how can I help you?</p>
        </div>}
        {conversationMessages.map((message, index) => <div className={`dpl-request-chat-message dpl-request-chat-message-${message.role === "assistant" ? "system" : "user"}`} key={index}>{message.content}</div>)}
        {isDraftConversation && selectedConversation === intakeConversation && !draftTemplate && conversationMessages.at(-1)?.proposedIntention && <div className="dpl-draft-intent-proposal"><strong>Proposed request type: {conversationMessages.at(-1)!.proposedIntention}</strong><button type="button" className="dpl-draft-editor-toggle" onClick={() => selectIntention(conversationMessages.at(-1)!.proposedIntention!)}><Check size={14} aria-hidden="true" />Confirm request type</button></div>}
        {assistantBusy && <p role="status" className="dpl-request-workspace-note">Assistant is responding...</p>}
        {assistantError && <p role="alert" className="dpl-request-workspace-note">{assistantError}</p>}
      </div>
      {isReadOnlyIntake ? <p className="dpl-request-workspace-note">Audit record · Read-only</p> : <form className="dpl-request-chat-composer" onSubmit={(event) => void sendMessage(event)}><input ref={messageInputRef} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message" aria-label="Message" /><button type="submit" aria-label="Send message" disabled={!messageText.trim() || assistantBusy}><Send size={15} /></button></form>}
    </section>{templatePanel}</>;
  }

  return <><section className="dpl-panel dpl-request-conversations" aria-label="Request conversations">
    <div className="dpl-section-heading dpl-conversations-heading"><div><h2>Conversations</h2></div><div className="dpl-conversation-heading-actions"><label className="dpl-conversation-search"><Search size={13} /><input type="search" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search" aria-label="Search conversations" /></label><button type="button" className="dpl-new-conversation-button" onClick={createConversation}>+ New conversation</button></div></div>
    <div className="dpl-request-conversation-list">{visibleConversations.length ? visibleConversations.map((conversation) => <div className="dpl-request-conversation-row" key={conversation}>
      {renamingConversation === conversation ? <input autoFocus aria-label="Conversation name" value={conversationName} onChange={(event) => setConversationName(event.target.value)} onBlur={saveConversationName} onKeyDown={(event) => { if (event.key === "Enter") saveConversationName(); if (event.key === "Escape") setRenamingConversation(null); }} /> : <button type="button" className="dpl-conversation-open" title={!isDraftConversation && conversation === intakeConversation ? "Protected conversation. Renaming and deletion are disabled." : undefined} onClick={() => setSelectedConversation(conversation)}>
        {!isDraftConversation && conversation === intakeConversation && <ShieldCheck className="dpl-conversation-shield" size={14} aria-hidden="true" />}
        <span className="dpl-conversation-title">{conversation === intakeConversation && conversation === defaultIntakeTitle ? "Intake & Discovery Conversation" : conversation}</span>
        {!isDraftConversation && conversation === intakeConversation && <span className="dpl-conversation-audit-label">Audit record</span>}
      </button>}
      {(isDraftConversation || conversation !== intakeConversation) && <button type="button" className="dpl-conversation-rename-button" aria-label={`Rename ${conversation}`} title="Rename conversation" onClick={() => { setRenamingConversation(conversation); setConversationName(conversation); }}><Pencil size={13} /></button>}
      {allowDeletion && (isDraftConversation || conversation !== intakeConversation) && <button type="button" className="dpl-conversation-delete-button" aria-label={`Delete ${conversation}`} title="Delete conversation" onClick={() => setConversationPendingDeletion(conversation)}><Trash2 size={13} /></button>}
    </div>) : <p className="dpl-conversation-search-empty">No conversations match this search.</p>}</div>
    {allowDeletion && conversationPendingDeletion && <div className="dpl-request-dialog-backdrop" role="presentation"><section className="dpl-request-dialog dpl-conversation-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-conversation-title"><div><p className="dpl-conversation-delete-dialog-label">Permanent action</p><h2 id="delete-conversation-title">Delete conversation?</h2><p><strong>{conversationPendingDeletion}</strong> and all its messages will be permanently deleted. This cannot be restored.</p></div><footer><button type="button" onClick={() => setConversationPendingDeletion(null)}>Cancel</button><button type="button" className="dpl-conversation-delete-confirm" onClick={() => deleteConversation(conversationPendingDeletion)}>Delete conversation</button></footer></section></div>}
  </section>{templatePanel}</>;
}

export function HelpWorkspace() {
  return (
    <section className="dpl-panel dpl-help-workspace" aria-label="Help">
      <div className="dpl-section-heading"><div><h2>Help</h2><p>Guidance for working with the Data Product Lifecycle Portal.</p></div></div>
      <div className="dpl-help-items">
        <section><h3>Start a request</h3><p>Use New chat and choose a request type. Structured templates appear when that request type needs one.</p></section>
        <section><h3>Track lifecycle work</h3><p>Use Current requests to review active work and open a request dashboard.</p></section>
        <section><h3>Find older work</h3><p>Completed requests move to Archive after 30 days and remain available for reference.</p></section>
      </div>
    </section>
  );
}

function CurrentProcess({ request, viewControls, preparationTemplate, embedded = false }: { request: { stage: string; status: string; currentSubstep: string; dataProductType: string; businessJira?: string; technicalJira?: string }; embedded?: boolean; preparationTemplate?: DraftConversationTemplate | null; viewControls: { heading: ReactNode; onOpenBusiness: () => void; onOpenStxad: () => void; onSelectIntent: () => void; onOpenPreparation: () => void } }) {
  const isPreparing = request.stage === "Request Preparation";
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    window.addEventListener("dpl-draft-content-changed", update);
    return () => window.removeEventListener("dpl-draft-content-changed", update);
  }, []);
  const readiness = preparationTemplate ? getDraftReadiness(preparationTemplate) : null;
  const templateComplete = !isPreparing || Boolean(readiness && readiness.missing.length === 0);
  const intentSelected = preparationTemplate !== null;
  const activeStepIndex = lifecycle.findIndex(
    (step) => step.shortLabel === request.stage || step.label.startsWith(request.stage),
  );
  const [openStage, setOpenStage] = useState<string>(isPreparing ? "Request Preparation" : lifecycle[activeStepIndex]?.label ?? lifecycle[0].label);
  const completedStages = Math.max(activeStepIndex, 0) + (request.status === "Completed" && activeStepIndex >= 0 ? 1 : 0);
  const lifecycleProgress = Math.round((completedStages / lifecycle.length) * 100);

  return (
    <section className={`${embedded ? "" : "dpl-panel "}dpl-current-process dpl-fixed-tracker-header`} aria-label="Selected request" style={{ flex: "1 1 0", minHeight: 0 }}>
      <div className="dpl-section-heading dpl-record-header">
        {viewControls.heading}
      </div>
      <div className="dpl-tracker">
        <div className="dpl-lifecycle-summary" aria-label="Lifecycle progress summary">
          <div><span>Lifecycle progress</span><strong>{completedStages} of {lifecycle.length} stages complete</strong></div>
          <strong>{lifecycleProgress}%</strong>
          <div className="dpl-lifecycle-progress"><span style={{ width: `${lifecycleProgress}%` }} /></div>
        </div>
        <div className="dpl-stepper" aria-label="Lifecycle tracker">
          <div className="dpl-lifecycle-preparation" aria-label="Before official lifecycle">
            <section className={`dpl-step ${isPreparing ? "dpl-lifecycle-active" : "dpl-lifecycle-complete"} ${openStage === "Request Preparation" ? "dpl-step-expanded" : ""}`}>
              <button type="button" className="dpl-step-trigger" aria-expanded={openStage === "Request Preparation"} aria-controls="request-draft-preparation" onClick={() => setOpenStage(openStage === "Request Preparation" ? "" : "Request Preparation")}>
                <span className={`dpl-step-icon ${isPreparing ? "dpl-step-active" : "dpl-step-complete"}`} aria-hidden="true">{!isPreparing && <Check size={13} strokeWidth={3} />}</span>
                <span className="dpl-step-label">Request Preparation</span>
                <span className={`dpl-step-state dpl-step-state-${isPreparing ? "active" : "complete"}`}>{isPreparing ? "in progress" : "complete"}</span>
                <ChevronDown className="dpl-step-chevron" size={14} aria-hidden="true" />
              </button>
              {openStage === "Request Preparation" && <div className="dpl-step-content" id="request-draft-preparation"><ul className="dpl-checklist">
                <li>{intentSelected ? <Check size={14} /> : <Circle size={14} />}<span className="dpl-lifecycle-task-copy"><span className="dpl-lifecycle-task-title"><span>Choose request type</span><button type="button" className="dpl-new-conversation-button" onClick={viewControls.onSelectIntent}>Choose type</button></span><small>{isPreparing ? "Selected type" : "Submitted type"}: {request.dataProductType}</small></span></li>
                <li>{templateComplete ? <Check size={14} /> : <Circle size={14} />}<span className="dpl-lifecycle-task-copy"><span className="dpl-lifecycle-task-title"><span>Complete template</span><button type="button" className="dpl-new-conversation-button" disabled={!intentSelected} title={!intentSelected ? "Choose a request type first" : undefined} onClick={viewControls.onOpenPreparation}>Template</button></span>{readiness && <small>{templateComplete ? "Complete" : `${readiness.missing.length} fields remaining`}</small>}</span></li>
                <li>{isPreparing ? <Circle size={14} /> : <Check size={14} />}<span className="dpl-lifecycle-task-copy"><span className="dpl-lifecycle-task-title"><span>Review and submit</span>{isPreparing && preparationTemplate !== undefined && <DraftSubmissionActions inline disabled={!preparationTemplate || !templateComplete} title={preparationTemplate ? draftIntentionTemplates[preparationTemplate.intention]?.title ?? "One Pager" : "request"} />}</span><small>{isPreparing ? templateComplete ? "Ready for review" : "Pending" : "Completed for the submitted request"}</small></span></li>
              </ul></div>}
            </section>
          </div>
          {lifecycle.map((step, index) => (
            (() => {
              const state = index < activeStepIndex || (request.status === "Completed" && index === activeStepIndex)
                ? "complete"
                : index === activeStepIndex ? "active" : "pending";
              const expanded = openStage === step.label;
              const details = stageDetails[step.label]!;
              const currentTaskIndex = step.label === request.stage
                ? details.tasks.findIndex((task) => task.name === request.currentSubstep || (task.name === "Request Approved or Request Rejected" && ["Request Approved", "Request Rejected"].includes(request.currentSubstep)))
                : -1;
              return <section className={`dpl-step dpl-lifecycle-${state} ${expanded ? "dpl-step-expanded" : ""}`} key={step.label}>
                <button
                  type="button"
                  className="dpl-step-trigger"
                  aria-expanded={expanded}
                  aria-controls={details.description || details.tasks.length > 0 ? `lifecycle-stage-${index}` : undefined}
                  onClick={() => setOpenStage(expanded ? "" : step.label)}
                >
                  <span className={`dpl-step-icon dpl-step-${state}`}>
                    {state === "complete" ? <Check size={13} strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="dpl-step-label">{step.label}</span>
                  <span className={`dpl-step-state dpl-step-state-${state}`}>{state === "active" ? "In progress" : state}</span>
                  <ChevronDown className="dpl-step-chevron" size={14} aria-hidden="true" />
                </button>
                {expanded && (details.description || details.tasks.length > 0) && (
                  <div className="dpl-step-content" id={`lifecycle-stage-${index}`}>
                    {details.description && <p>{details.description}</p>}
                    {details.tasks.length > 0 && <ul className="dpl-checklist">
                      {details.tasks.map(({ name, responsible, optional }, taskIndex) => {
                        const skipped = optional && request.currentSubstep !== name;
                        const resolvedState = skipped ? "pending" : state === "complete" ? "complete" : state === "active" && currentTaskIndex >= 0
                          ? taskIndex < currentTaskIndex ? "complete" : taskIndex === currentTaskIndex ? "active" : "pending"
                          : "pending";
                        const displayName = name === "Request Approved or Request Rejected" && (state === "complete" || ["Request Approved", "Request Rejected"].includes(request.currentSubstep))
                          ? request.currentSubstep === "Request Rejected" ? "Request Rejected" : "Request Approved"
                          : name;
                        return <li key={name} className={`dpl-check-${resolvedState}`}>
                          {resolvedState === "complete" ? <Check size={14} /> : resolvedState === "active" ? <span className="dpl-active-dot" /> : <Circle size={14} />}
                          <span className="dpl-lifecycle-task-copy"><span className="dpl-lifecycle-task-title"><span>{displayName}{optional && " (if required)"}</span>{name === "Request Under Review" && <button type="button" className="dpl-new-conversation-button" disabled={!request.businessJira?.trim()} title={request.businessJira?.trim() || "Business Jira is not available yet"} onClick={viewControls.onOpenBusiness}>Business Jira</button>}{name === "Analysis Initiation" && <button type="button" className="dpl-new-conversation-button" disabled={!request.technicalJira?.trim()} title={request.technicalJira?.trim() || "STXAD Jira is not available yet"} onClick={viewControls.onOpenStxad}>STXAD Jira</button>}</span><small>Assigned to: {responsible ?? "Not specified"}</small></span>
                        </li>;
                      })}
                    </ul>}
                  </div>
                )}
              </section>;
            })()
          ))}
        </div>
      </div>
    </section>
  );
}

export function LifecycleDashboard({ selectedRequestName, mode, businessCaseId, onShowRecords, overlay = false }: { selectedRequestName: string | null; mode: "overview" | "record" | "businessCase"; businessCaseId: string | null; onShowRecords: () => void; overlay?: boolean }) {
  const selectedRequest = selectedRequestName ? requestedProcesses.find((request) => request.name === selectedRequestName) : undefined;
  const intentTemplate = Object.entries(intentTemplates).find(([prefix]) => businessCaseId?.startsWith(`${prefix}-`));
  const [recordView, setRecordView] = useState<"dashboard" | "business" | "template" | "intent" | "preparation">("dashboard");
  const [preparationIntent, setPreparationIntent] = useState<DraftIntention | null>(null);

  useEffect(() => {
    setRecordView("dashboard");
    const saved = window.localStorage.getItem(`dpl-request-preparation-intent:${selectedRequestName}`);
    setPreparationIntent(draftIntentions.includes(saved as DraftIntention) ? saved as DraftIntention : null);
  }, [selectedRequestName]);

  const recordTemplateId = selectedRequest?.requestId ?? "request-template";
  const selectedPreparationIntent = preparationIntent ?? (draftIntentions.includes(selectedRequest?.dataProductType as DraftIntention) ? selectedRequest?.dataProductType as DraftIntention : null);
  const selectPreparationIntent = (intention: DraftIntention) => {
    setPreparationIntent(intention);
    window.localStorage.setItem(`dpl-request-preparation-intent:${selectedRequestName}`, intention);
    setRecordView("preparation");
  };
  const preparationTemplateId = `request-preparation-${recordTemplateId}-${selectedPreparationIntent ? toFieldName(selectedPreparationIntent) : "unselected"}`;
  const recordTemplate = recordView === "intent" || (recordView === "preparation" && !selectedPreparationIntent)
    ? <div className="dpl-draft-intent-picker-body"><div className="dpl-draft-intent-content"><p className="dpl-draft-intent-introduction">Choose a request type for a preparation template. The submitted request and Business Jira record remain unchanged.</p><div className="dpl-draft-conversation-intentions" aria-label="Request types">{draftIntentions.map((intention) => <button type="button" key={intention} aria-label={intention} aria-describedby={`preparation-intent-${toFieldName(intention)}`} onClick={() => selectPreparationIntent(intention)}><span>{intention}</span><IntentInfo intention={intention} id={`preparation-intent-${toFieldName(intention)}`} /></button>)}</div></div></div>
    : recordView === "preparation" && selectedPreparationIntent
    ? <><p className="dpl-request-workspace-note">Preparation copy. Changes do not update the submitted request or Jira ticket.</p>{draftIntentionTemplates[selectedPreparationIntent]
      ? <IntentTemplateForm key={preparationTemplateId} businessCaseId={preparationTemplateId} template={draftIntentionTemplates[selectedPreparationIntent]!} />
      : <BusinessCaseTemplate key={preparationTemplateId} businessCaseId={preparationTemplateId} intention={selectedPreparationIntent} />}</>
    : recordView === "business"
    ? <BusinessCaseTemplate key={`${recordTemplateId}-one-pager`} businessCaseId={recordTemplateId} readOnly />
    : <BusinessRequirementsTemplate key={`${recordTemplateId}-business-requirements`} businessCaseId={recordTemplateId} />;
  const recordViewControls = { onOpenBusiness: () => setRecordView("business"), onOpenStxad: () => setRecordView("template"), onSelectIntent: () => setRecordView("intent"), onOpenPreparation: () => setRecordView("preparation"), heading: <div className="dpl-record-view-switch" aria-label="Request workspace views">
    <h2>Lifecycle Tracker</h2>
  </div> };
  const recordDocumentControls = <div className="dpl-draft-document-heading dpl-request-document-heading">
    <h2>{recordView === "business" ? "Business Jira" : recordView === "intent" ? "Request type" : recordView === "preparation" ? "Preparation Template" : "STXAD Jira"}</h2>
    <button type="button" className="dpl-conversations-back" onClick={() => setRecordView("dashboard")}><ArrowLeft size={14} aria-hidden="true" />Back to Lifecycle Tracker</button>
  </div>;

  return (
    <aside className={`dpl-dashboard${mode === "businessCase" ? " dpl-dashboard-workspace" : ""}${overlay ? " dpl-dashboard-overlay" : ""}`} style={{ minHeight: 0, overflow: "hidden" }}>
      {mode === "businessCase" ? <section className="dpl-panel dpl-workspace-shell"><div className="dpl-section-heading"><div><h2>Request Workspace</h2><p>Draft and refine the information needed for this request.</p></div></div>{businessCaseId?.startsWith("business-requirements-") ? <BusinessRequirementsTemplate key={businessCaseId} businessCaseId={businessCaseId} /> : businessCaseId?.startsWith("technical-design-") ? <TechnicalDesignTemplate key={businessCaseId} businessCaseId={businessCaseId} /> : intentTemplate ? <IntentTemplateForm key={businessCaseId} businessCaseId={businessCaseId ?? "new-intent-template"} template={intentTemplate[1]} /> : <BusinessCaseTemplate key={businessCaseId ?? "new-business-case"} businessCaseId={businessCaseId ?? "new-business-case"} />}</section> : mode === "record" && selectedRequest ? recordView === "dashboard" ? <CurrentProcess request={selectedRequest} viewControls={recordViewControls} /> : <section className="dpl-panel dpl-workspace-shell dpl-record-template"><div className="dpl-section-heading">{recordDocumentControls}</div>{recordView === "business" && <a className="dpl-link-button" href={`https://devopsjira.deutsche-boerse.com/browse/${selectedRequest.businessJira}`} target="_blank" rel="noopener noreferrer">{selectedRequest.businessJira} <ExternalLink size={12} aria-hidden="true" /></a>}{recordTemplate}</section> : <section className="dpl-panel dpl-context-placeholder"><LayoutGrid size={18} aria-hidden="true" /><h2>Contextual workspace</h2><p>Select an intention to open a supporting template, or select a request to view its lifecycle dashboard.</p></section>}
    </aside>
  );
}
