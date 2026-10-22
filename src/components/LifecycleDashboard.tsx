import {
  ArrowLeft,
  ChevronDown,
  Check,
  Circle,
  Clock3,
  ExternalLink,
  Info,
  LayoutGrid,
  Pencil,
  Pin,
  PinOff,
  Search,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { listThreads, threadsChangedEvent, type ThreadMetadata } from "../storage/threads";

const businessCaseIdsStorageKey = "dpl-business-case-ids";

const lifecycle = [
  { label: "Planning", shortLabel: "Planning", state: "complete" },
  { label: "Analysis", shortLabel: "Analysis", state: "complete" },
  { label: "Design", shortLabel: "Design", state: "complete" },
  { label: "Build & Test", shortLabel: "Build & Test", state: "active" },
  { label: "Deployment", shortLabel: "Deployment", state: "pending" },
  { label: "Consumption & Maintenance", shortLabel: "Consumption", state: "pending" },
  { label: "Retirement", shortLabel: "Retirement", state: "pending" },
] as const;

const stageDetails: Record<string, { description: string; tasks: readonly [string, "complete" | "active" | "pending"][] }> = {
  Planning: {
    description: "Validate the One Pager, strategic value, funding, and accountable delivery team.",
    tasks: [["One Pager Submission", "complete"], ["Strategic Review", "complete"], ["Strategic Approval", "complete"], ["Funding Review", "complete"], ["Funding Approval", "complete"], ["Team Assignment", "complete"], ["Planning Completion Check", "complete"], ["One Pager Approved", "complete"], ["Planning Completed", "complete"]],
  },
  Analysis: {
    description: "Define, approve, and register the business requirements and Business Data Contract.",
    tasks: [["Analysis Initiated", "complete"], ["Business Requirements Preparation", "complete"], ["Business Requirements Review", "complete"], ["Business Requirements Approved", "complete"], ["Business Data Contract Registration", "complete"], ["Business Data Contract Registered", "complete"], ["Analysis Completed", "complete"]],
  },
  Design: {
    description: "Establish the technical design, delivery estimate, governance review, and implementation plan.",
    tasks: [["Design Initiated", "complete"], ["Technical Design Preparation", "complete"], ["Technical Design Review", "complete"], ["Cost Estimation & Delivery Planning", "complete"], ["Cost Estimation Submitted", "complete"], ["Cost Review", "complete"], ["Funding Re-Approval (if required)", "complete"], ["Design Completed", "complete"]],
  },
  "Build & Test": {
    description: "Build the approved design, validate quality and controls, and obtain readiness for release.",
    tasks: [["Build Initiated", "complete"], ["Implementation", "complete"], ["Data Quality Validation", "complete"], ["Integration Testing", "active"], ["User Acceptance Testing", "pending"], ["Release Readiness Review", "pending"], ["Build & Test Completed", "pending"]],
  },
  Deployment: {
    description: "Deploy the validated product, complete production checks, and confirm operational handover.",
    tasks: [["Deployment Planning", "pending"], ["Production Deployment", "pending"], ["Production Validation", "pending"], ["Operational Handover", "pending"], ["Deployment Completed", "pending"]],
  },
  "Consumption & Maintenance": {
    description: "Operate the product, support consumers, and review quality, usage, and ongoing value.",
    tasks: [["Consumer Onboarding", "pending"], ["Usage Monitoring", "pending"], ["Data Quality Monitoring", "pending"], ["Service Review", "pending"], ["Maintenance Completed", "pending"]],
  },
  Retirement: {
    description: "Retire the product safely by informing consumers, preserving required records, and closing delivery ownership.",
    tasks: [["Retirement Assessment", "pending"], ["Consumer Communication", "pending"], ["Data Retention Confirmation", "pending"], ["Access Decommissioning", "pending"], ["Retirement Completed", "pending"]],
  },
};

const requestedProcesses = [
  { name: "C7", requestId: "TRD-2024-001", requestJira: "EXDPL-1041", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-001", title: "C7 Trading Data Product", dataProductType: "Create Regular IT Data Product", requester: "Natali Karlova-B.", domain: "Trading", businessJira: "EXDPL-1042", technicalJira: "EXDPL-1043", intent: "Create data product", stage: "Design", currentSubstep: "Technical Design Review", currentOwner: "Delivery Team Lead", sla: "3 days left", decision: "Awaiting review", updated: "Updated today", progress: 40, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Markus Meyer", itCounterpart: "Anna Müller", created: "May 14, 2024", action: "Review technical design" },
  { name: "MMPM", requestId: "GMP-2024-002", requestJira: "EXDPL-1044", atlanContractUrl: "https://atlan.example.com/contracts/GMP-2024-002", title: "MMPM Data Product", dataProductType: "Create Hybrid Data Product", requester: "Andreas Müller", domain: "Global Markets & Products", businessJira: "EXDPL-1045", technicalJira: "EXDPL-1046", intent: "Create data product (POC available)", stage: "Analysis", currentSubstep: "Business Requirements Preparation", currentOwner: "Data Product Owner", sla: "Due tomorrow", decision: "Awaiting input", updated: "Updated 2h ago", progress: 60, status: "Waiting", dataProductOwner: "Andreas Müller", domainOwner: "Sofia Weber", itCounterpart: "David Klein", created: "May 12, 2024", action: "Complete business requirements" },
  { name: "Reference Data", requestId: "CLR-2024-003", requestJira: "EXDPL-1047", atlanContractUrl: "https://atlan.example.com/contracts/CLR-2024-003", title: "Reference Data Retirement", dataProductType: "Request Retirement", requester: "Daniel Peters", domain: "Clearing", businessJira: "EXDPL-1048", technicalJira: "EXDPL-1049", intent: "Request retirement", stage: "Retirement", currentSubstep: "Retirement completed", currentOwner: "Data Product Owner", sla: "Completed", decision: "Approved", updated: "Updated May 6", progress: 100, status: "Completed", dataProductOwner: "Daniel Peters", domainOwner: "Sabine Keller", itCounterpart: "Felix Roth", created: "May 06, 2024", action: "Retirement completed" },
  { name: "Orders & Quotes", requestId: "TRD-2024-004", requestJira: "EXDPL-1050", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-004", title: "Orders & Quotes Quality Issue", dataProductType: "Report Issue", requester: "Daniel Peters", domain: "Trading", businessJira: "EXDPL-1051", technicalJira: "EXDPL-1052", intent: "Report issue", stage: "Analysis", currentSubstep: "Business Requirements Review", currentOwner: "Data Product Owner", sla: "1 day left", decision: "Awaiting approval", updated: "Updated today", progress: 80, status: "In Progress", dataProductOwner: "Daniel Peters", domainOwner: "Julia Fischer", itCounterpart: "Martin Bauer", created: "May 10, 2024", action: "Review business requirements" },
  { name: "M2M", requestId: "RSK-2024-005", requestJira: "EXDPL-1053", atlanContractUrl: "https://atlan.example.com/contracts/RSK-2024-005", title: "M2M Product Enhancement", dataProductType: "Enhance Existing Data Product", requester: "Natali Karlova-B.", domain: "Risk", businessJira: "EXDPL-1054", technicalJira: "EXDPL-1055", intent: "Enhance existing data product", stage: "Design", currentSubstep: "Cost Estimation & Delivery Planning", currentOwner: "Delivery Team Lead", sla: "5 days left", decision: "No decision yet", updated: "Updated yesterday", progress: 15, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Lena Hoffmann", itCounterpart: "Thomas Wagner", created: "May 08, 2024", action: "Prepare delivery plan" },
  { name: "Market Data Portal", requestId: "GMP-2024-006", requestJira: "EXDPL-1056", atlanContractUrl: "https://atlan.example.com/contracts/GMP-2024-006", title: "Market Data Portal Self-Service Registration", dataProductType: "Register Self-Service Data Product", requester: "Sofia Weber", domain: "Global Markets & Products", businessJira: "EXDPL-1057", technicalJira: "EXDPL-1058", intent: "Register self-service data product", stage: "Analysis", currentSubstep: "Business Data Contract Registration", currentOwner: "Data Product Owner", sla: "4 days left", decision: "Awaiting review", updated: "Updated today", progress: 45, status: "In Progress", dataProductOwner: "Sofia Weber", domainOwner: "Andreas Müller", itCounterpart: "David Klein", created: "May 16, 2024", action: "Register business data contract" },
  { name: "Legacy Risk Feed", requestId: "RSK-2024-007", requestJira: "EXDPL-1059", atlanContractUrl: "https://atlan.example.com/contracts/RSK-2024-007", title: "Legacy Risk Feed Retirement", dataProductType: "Request Retirement", requester: "Lena Hoffmann", domain: "Risk", businessJira: "EXDPL-1060", technicalJira: "EXDPL-1061", intent: "Request retirement", stage: "Planning", currentSubstep: "One Pager Approved", currentOwner: "Data Product Owner", sla: "6 days left", decision: "Awaiting approval", updated: "Updated yesterday", progress: 10, status: "Waiting", dataProductOwner: "Lena Hoffmann", domainOwner: "Thomas Wagner", itCounterpart: "Felix Roth", created: "May 15, 2024", action: "Confirm retirement scope" },
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
  return request ? { title: request.title, requestId: request.requestId } : undefined;
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
    { domain: "Trading", count: 68 },
    { domain: "Clearing", count: 39 },
    { domain: "Risk", count: 44 },
    { domain: "Global Markets & Products", count: 33 },
  ];
  const onboardedProducts = domainProductCounts.reduce((total, { count }) => total + count, 0);
  const inProgressRequests = activeRequests.filter((request) => request.status === "In Progress").length;
  const waitingRequests = activeRequests.filter((request) => request.status === "Waiting").length;
  const maxDomainCount = Math.max(...domainProductCounts.map(({ count }) => count), 1);

  return <section className="dpl-panel dpl-portal-dashboard" aria-label="Data product dashboard">
    <div className="dpl-section-heading"><div><h2>Dashboard</h2><p>Data product onboarding and request activity at a glance.</p></div><button type="button" className="dpl-link-button" onClick={onOpenRequests}>View all requests</button></div>
    <div className="dpl-portal-dashboard-metrics">
      <article><span>Data products onboarded</span><strong>{onboardedProducts}</strong><small>Established product estate</small></article>
      <article><span>Open requests</span><strong>{activeRequests.length}</strong><small>Across all domains</small></article>
      <article><span>In progress</span><strong>{inProgressRequests}</strong><small>Currently being delivered</small></article>
      <article><span>Waiting</span><strong>{waitingRequests}</strong><small>Need input or approval</small></article>
    </div>
    <section className="dpl-portal-dashboard-domains" aria-labelledby="dashboard-domains-heading">
      <div><h3 id="dashboard-domains-heading">Data products by domain</h3><span>All tracked requests</span></div>
      <div className="dpl-domain-bars">{domainProductCounts.map(({ domain, count }) => <div key={domain}><span>{domain}</span><div aria-label={`${domain}: ${count} onboarded data products`}><i style={{ width: `${(count / maxDomainCount) * 100}%` }} /></div><strong>{count}</strong></div>)}</div>
    </section>
  </section>;
}

function BusinessCaseTemplate({ businessCaseId }: { businessCaseId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `dpl-business-case-draft:${businessCaseId}`;

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft || !formRef.current) return;
    const values = JSON.parse(savedDraft) as Record<string, string>;
    Object.entries(values).forEach(([name, value]) => {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (field) field.value = value;
    });
  }, [storageKey]);

  const persistDraft = () => {
    if (!formRef.current) return;
    const values = Object.fromEntries(new FormData(formRef.current).entries()) as Record<string, string>;
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  };

  return (
    <section className="dpl-panel dpl-business-case" aria-label="One Pager">
      <div className="dpl-section-heading"><div><h2>One Pager</h2><p>Capture the request before it enters the Planning stage.</p></div></div>
      <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
        <TemplateField label="Request Type" open><select name="productType" aria-label="Request Type" defaultValue=""><option value="" disabled>Select a type</option><option>Create Regular IT Data Product</option><option>Create Hybrid Data Product</option><option>Register Self-Service Data Product</option><option>Enhance Existing Data Product</option><option>Report Issue</option><option>Request Retirement</option></select></TemplateField>
        <TemplateField label="Ownership"><select name="ownership" aria-label="Ownership" defaultValue=""><option value="" disabled>Select a domain</option><option>Trading</option><option>Clearing</option><option>Risk</option><option>Global Markets & Products</option></select></TemplateField>
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
        <div className="dpl-business-case-actions"><button type="button" className="dpl-business-case-submit">Submit</button></div>
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

function IntentTemplateForm({ businessCaseId, template }: { businessCaseId: string; template: IntentTemplate }) {
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `dpl-intent-template-draft:${businessCaseId}`;

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft || !formRef.current) return;
    const values = JSON.parse(savedDraft) as Record<string, string>;
    Object.entries(values).forEach(([name, value]) => {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
      if (field) field.value = value;
    });
  }, [storageKey]);

  const persistDraft = () => {
    if (!formRef.current) return;
    window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(new FormData(formRef.current).entries())));
  };

  return <section className="dpl-panel dpl-business-case" aria-label={`${template.title} template`}>
    <div className="dpl-section-heading"><div><h2>{template.title}</h2><p>{template.description}</p></div></div>
    <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
      {template.fields.map((label, index) => <TemplateField key={label} label={label} open={index === 0}><textarea name={toFieldName(label)} aria-label={label} rows={2} placeholder={`Add ${label.toLowerCase()}`} /></TemplateField>)}
      <div className="dpl-business-case-actions"><button type="button" className="dpl-business-case-submit">Save draft</button></div>
    </form>
  </section>;
}

function BusinessRequirementsTemplate({ businessCaseId }: { businessCaseId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `dpl-business-requirements-draft:${businessCaseId}`;

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft || !formRef.current) return;
    const values = JSON.parse(savedDraft) as Record<string, string>;
    Object.entries(values).forEach(([name, value]) => {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (field) field.value = value;
    });
  }, [storageKey]);

  const persistDraft = () => {
    if (!formRef.current) return;
    window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(new FormData(formRef.current).entries())));
  };

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
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `dpl-technical-design-draft:${businessCaseId}`;

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(storageKey);
    if (!savedDraft || !formRef.current) return;
    const values = JSON.parse(savedDraft) as Record<string, string>;
    Object.entries(values).forEach(([name, value]) => {
      const field = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
      if (field) field.value = value;
    });
  }, [storageKey]);

  const persistDraft = () => {
    if (!formRef.current) return;
    window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(new FormData(formRef.current).entries())));
  };

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

function RunningRequestsOverview({ selectedRequestName, onSelectRequest, scope }: { selectedRequestName: string | null; onSelectRequest: (name: string) => void; scope: RequestScope }) {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [requestTab, setRequestTab] = useState<"current" | "assignedToMe" | "createdByMe">(scope === "createdByMe" ? "createdByMe" : "current");
  const [pinnedRequestNames, setPinnedRequestNames] = useState<string[]>(getPinnedRequestNames);
  const resolvedScope = scope === "current" ? requestTab : scope;
  const scopedProcesses = resolvedScope === "archive"
    ? requestedProcesses.filter(isArchivedRequest)
    : resolvedScope === "drafts" ? [] : requestedProcesses.filter((process) => !isArchivedRequest(process) && (resolvedScope !== "createdByMe" || process.requester === currentPortalUser) && (resolvedScope !== "assignedToMe" || requestAssigneeByName[process.name] === currentPortalUser));
  const isArchive = resolvedScope === "archive";
  const isDrafts = resolvedScope === "drafts";
  const isCreatedByMe = resolvedScope === "createdByMe";
  const isAssignedToMe = resolvedScope === "assignedToMe";
  const visibleProcesses = isArchive || selectedStatus === "All"
    ? scopedProcesses
    : scopedProcesses.filter((process) => process.status === selectedStatus);
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
      {scope === "current" && <div className="dpl-request-scope-tabs" role="tablist" aria-label="Request scope"><button type="button" role="tab" aria-selected={requestTab === "current"} className={requestTab === "current" ? "active" : ""} onClick={() => setRequestTab("current")}>All</button><button type="button" role="tab" aria-selected={requestTab === "createdByMe"} className={requestTab === "createdByMe" ? "active" : ""} onClick={() => setRequestTab("createdByMe")}>Created by me</button><button type="button" role="tab" aria-selected={requestTab === "assignedToMe"} className={requestTab === "assignedToMe" ? "active" : ""} onClick={() => setRequestTab("assignedToMe")}>Assigned to me</button></div>}
      <div className="dpl-section-heading"><div><h2>{isArchive ? "Archive" : isDrafts ? "Drafts" : isAssignedToMe ? "Assigned to me" : isCreatedByMe ? "Created by me" : "All requests"}</h2><p>{isArchive ? "Completed, cancelled, rejected, and retired requests retained for reference." : isDrafts ? "Draft conversations remain under Drafts until their One Pager is submitted." : isAssignedToMe ? "Requests with Jira work currently assigned to you." : isCreatedByMe ? "Requests you created in the portal." : "Track in-progress, waiting, and recently completed requests."}</p></div><div className="dpl-overview-header-note"><Info size={14} /><span>{isDrafts ? "Open a draft conversation from the sidebar to continue its intake." : "Select a request to view its lifecycle dashboard."}</span></div></div>
      {!isArchive && !isDrafts && <div className="dpl-process-tabs" aria-label="Request status filter">
        {['All', 'In Progress', 'Waiting', 'Completed'].map((tab) => (
          <button key={tab} type="button" className={tab === selectedStatus ? "active" : ""} onClick={() => setSelectedStatus(tab)}>{tab}</button>
        ))}
      </div>}
      <div className="dpl-overview-list" aria-label="Request records">
        {isDrafts && <p className="dpl-sidebar-empty">Draft requests are created from New request and retain their intake conversations.</p>}
        {visibleProcesses.map((request) => (
          <div className={`dpl-overview-request ${request.name === selectedRequestName ? "dpl-selected-request" : ""}`} key={request.name} role="button" tabIndex={0} onClick={() => onSelectRequest(request.name)} onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelectRequest(request.name);
            }
          }}>
            <div className="dpl-request-record-title"><div><strong>{request.title}</strong><span className={`dpl-table-status ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span></div><button type="button" className="dpl-request-pin" onClick={(event) => { event.stopPropagation(); togglePinnedRequest(request.name); }} title={pinnedRequestNames.includes(request.name) ? "Unpin request" : "Pin request"} aria-label={pinnedRequestNames.includes(request.name) ? `Unpin ${request.title}` : `Pin ${request.title}`}>{pinnedRequestNames.includes(request.name) ? <PinOff size={14} /> : <Pin size={14} />}</button></div>
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

function DraftsOverview() {
  const [drafts, setDrafts] = useState<ThreadMetadata[]>([]);

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

  return <section className="dpl-panel dpl-running-overview" aria-label="Draft requests">
    <div className="dpl-section-heading"><div><h2>Drafts</h2><p>Continue an intake conversation or refine its shared One Pager before submission.</p></div></div>
    <div className="dpl-overview-list" aria-label="Draft request records">
      {drafts.length === 0 ? <p className="dpl-sidebar-empty">No draft requests yet.</p> : drafts.map((draft) => <button type="button" className="dpl-overview-request dpl-draft-request" key={draft.remoteId} onClick={() => window.dispatchEvent(new CustomEvent("dpl-open-draft", { detail: { threadId: draft.remoteId } }))}>
        <div className="dpl-request-record-title"><div><strong>{draft.title ?? "Untitled request"}</strong><span className="dpl-table-status waiting">Draft</span></div></div>
        <div className="dpl-request-record-cell"><span>Intake conversation</span><strong>Open draft</strong></div>
        <div className="dpl-request-record-cell"><span>Created</span><strong>{new Date(draft.createdAt).toLocaleDateString()}</strong></div>
      </button>)}
    </div>
  </section>;
}

export function RequestWorkspace({ scope, selectedRequestName, onSelectRequest }: { scope: RequestScope; selectedRequestName: string | null; onSelectRequest: (name: string) => void }) {
  return scope === "drafts" ? <DraftsOverview /> : <RunningRequestsOverview scope={scope} selectedRequestName={selectedRequestName} onSelectRequest={onSelectRequest} />;
}

export function DraftWorkspace({ draftId, onBack }: { draftId: string; onBack: () => void }) {
  return <section className="dpl-draft-workspace" aria-label="Draft request workspace">
    <nav className="dpl-draft-workspace-identity" aria-label="Draft path"><button type="button" onClick={onBack}><ArrowLeft size={13} />Drafts</button><span aria-hidden="true">/</span><em>Draft workspace</em></nav>
    <div className="dpl-draft-workspace-content"><RequestConversationsWorkspace requestName={`draft:${draftId}`} /><aside className="dpl-panel dpl-draft-workspace-empty" aria-label="Draft workspace" /></div>
  </section>;
}

function conversationStorageKey(requestName: string) {
  return `dpl-request-conversations:${requestName}`;
}

function conversationMessagesStorageKey(requestName: string) {
  return `dpl-request-conversation-messages:${requestName}`;
}

export function RequestConversationsWorkspace({ requestName }: { requestName: string }) {
  const [conversations, setConversations] = useState<string[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string[]>>({});
  const [messageText, setMessageText] = useState("");
  const [renamingConversation, setRenamingConversation] = useState<string | null>(null);
  const [conversationName, setConversationName] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(conversationStorageKey(requestName));
    const loaded = saved ? JSON.parse(saved) as string[] : ["Intake conversation"];
    const savedMessages = window.localStorage.getItem(conversationMessagesStorageKey(requestName));
    setConversations(loaded);
    setSelectedConversation(null);
    setMessages(savedMessages ? JSON.parse(savedMessages) as Record<string, string[]> : {});
    setMessageText("");
    setRenamingConversation(null);
    setConversationName("");
    setConversationSearch("");
  }, [requestName]);

  const createConversation = () => {
    const next = [...conversations, `Conversation ${conversations.length + 1}`];
    setConversations(next);
    setSelectedConversation(next.at(-1) ?? null);
    window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(next));
  };

  const sendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = messageText.trim();
    if (!message || !selectedConversation) return;
    const nextMessages = { ...messages, [selectedConversation]: [...(messages[selectedConversation] ?? []), message] };
    setMessages(nextMessages);
    setMessageText("");
    window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
  };

  const saveConversationName = () => {
    const nextName = conversationName.trim();
    if (!renamingConversation || !nextName || nextName === renamingConversation || conversations.includes(nextName)) {
      setRenamingConversation(null);
      return;
    }
    const nextConversations = conversations.map((conversation) => conversation === renamingConversation ? nextName : conversation);
    const { [renamingConversation]: renamedMessages, ...remainingMessages } = messages;
    const nextMessages = { ...remainingMessages, ...(renamedMessages ? { [nextName]: renamedMessages } : {}) };
    setConversations(nextConversations);
    setMessages(nextMessages);
    setRenamingConversation(null);
    window.localStorage.setItem(conversationStorageKey(requestName), JSON.stringify(nextConversations));
    window.localStorage.setItem(conversationMessagesStorageKey(requestName), JSON.stringify(nextMessages));
  };

  const deleteConversation = (conversation: string) => {
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

  if (selectedConversation) {
    const conversationMessages = messages[selectedConversation] ?? [];
    return <section className="dpl-panel dpl-request-conversations dpl-request-chat" aria-label={`${selectedConversation} chat`}>
      <div className="dpl-section-heading dpl-conversations-heading"><div><button type="button" className="dpl-conversations-back" onClick={() => setSelectedConversation(null)}><ArrowLeft size={14} /> All conversations</button><h2>{selectedConversation}</h2></div></div>
      <div className="dpl-request-chat-messages" aria-live="polite">
        {conversationMessages.map((message, index) => <div className="dpl-request-chat-message dpl-request-chat-message-user" key={`${message}-${index}`}>{message}</div>)}
      </div>
      <form className="dpl-request-chat-composer" onSubmit={sendMessage}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message" aria-label="Message" /><button type="submit" aria-label="Send message" disabled={!messageText.trim()}><Send size={15} /></button></form>
    </section>;
  }

  return <section className="dpl-panel dpl-request-conversations" aria-label="Request conversations">
    <div className="dpl-section-heading dpl-conversations-heading"><div><h2>Conversations</h2></div><div className="dpl-conversation-heading-actions"><label className="dpl-conversation-search"><Search size={13} /><input type="search" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search" aria-label="Search conversations" /></label><button type="button" className="dpl-new-conversation-button" onClick={createConversation}>+ New conversation</button></div></div>
    <div className="dpl-request-conversation-list">{visibleConversations.length ? visibleConversations.map((conversation) => <div className="dpl-request-conversation-row" key={conversation}>{renamingConversation === conversation ? <input autoFocus aria-label="Conversation name" value={conversationName} onChange={(event) => setConversationName(event.target.value)} onBlur={saveConversationName} onKeyDown={(event) => { if (event.key === "Enter") saveConversationName(); if (event.key === "Escape") setRenamingConversation(null); }} /> : <button type="button" onClick={() => setSelectedConversation(conversation)}><span>{conversation}</span></button>}<button type="button" className="dpl-conversation-rename-button" aria-label={`Rename ${conversation}`} title="Rename conversation" onClick={() => { setRenamingConversation(conversation); setConversationName(conversation); }}><Pencil size={13} /></button><button type="button" className="dpl-conversation-delete-button" aria-label={`Delete ${conversation}`} title="Delete conversation" onClick={() => setConversationPendingDeletion(conversation)}><Trash2 size={13} /></button></div>) : <p className="dpl-conversation-search-empty">No conversations match this search.</p>}</div>
    {conversationPendingDeletion && <div className="dpl-request-dialog-backdrop" role="presentation"><section className="dpl-request-dialog dpl-conversation-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-conversation-title"><div><p className="dpl-conversation-delete-dialog-label">Permanent action</p><h2 id="delete-conversation-title">Delete conversation?</h2><p><strong>{conversationPendingDeletion}</strong> and all its messages will be permanently deleted. This cannot be restored.</p></div><footer><button type="button" onClick={() => setConversationPendingDeletion(null)}>Cancel</button><button type="button" className="dpl-conversation-delete-confirm" onClick={() => deleteConversation(conversationPendingDeletion)}>Delete conversation</button></footer></section></div>}
  </section>;
}

export function HelpWorkspace() {
  return (
    <section className="dpl-panel dpl-help-workspace" aria-label="Help">
      <div className="dpl-section-heading"><div><h2>Help</h2><p>Guidance for working with the Data Product Lifecycle Portal.</p></div></div>
      <div className="dpl-help-items">
        <section><h3>Start a request</h3><p>Use New chat and select an intention. Structured templates appear when that intention needs one.</p></section>
        <section><h3>Track lifecycle work</h3><p>Use Current requests to review active work and open a request dashboard.</p></section>
        <section><h3>Find older work</h3><p>Completed requests move to Archive after 30 days and remain available for reference.</p></section>
      </div>
    </section>
  );
}

function CurrentProcess({ request, viewControls }: { request: RequestedProcess; viewControls: ReactNode }) {
  const activeStepIndex = lifecycle.findIndex(
    (step) => step.shortLabel === request.stage || step.label.startsWith(request.stage),
  );
  const [openStage, setOpenStage] = useState<string>(lifecycle[activeStepIndex]?.label ?? lifecycle[0].label);
  const completedStages = request.status === "Completed" ? lifecycle.length : Math.max(activeStepIndex, 0);
  const lifecycleProgress = Math.round((completedStages / lifecycle.length) * 100);

  return (
    <section className="dpl-panel dpl-current-process" aria-label="Selected request" style={{ flex: "1 1 0", minHeight: 0, overflowX: "hidden", overflowY: "auto" }}>
      <div className="dpl-section-heading dpl-record-header">
        {viewControls}
      </div>
      <div className="dpl-tracker">
        <div className="dpl-lifecycle-summary" aria-label="Lifecycle progress summary">
          <div><span>Lifecycle progress</span><strong>{completedStages} of {lifecycle.length} stages complete</strong></div>
          <strong>{lifecycleProgress}%</strong>
          <div className="dpl-lifecycle-progress"><span style={{ width: `${lifecycleProgress}%` }} /></div>
        </div>
        <div className="dpl-stepper" aria-label="Lifecycle tracker">
          {lifecycle.map((step, index) => (
            (() => {
              const state = request.status === "Completed" || index < activeStepIndex
                ? "complete"
                : index === activeStepIndex ? "active" : "pending";
              const expanded = openStage === step.label;
              const details = stageDetails[step.label]!;
              const currentTaskIndex = step.label === request.stage
                ? details.tasks.findIndex(([task]) => task === request.currentSubstep)
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
                    {step.label === request.stage && <div className="dpl-stage-status-row" aria-label="Current stage status">
                      <span><UserRound size={12} /><b>Current assignee</b>{request.currentOwner}</span>
                      <span><Clock3 size={12} /><b>SLA</b>{request.sla}</span>
                      <span><b>Last update</b>{request.updated}</span>
                    </div>}
                    {details.tasks.length > 0 && <ul className="dpl-checklist">
                      {details.tasks.map(([name, taskState], taskIndex) => {
                        const resolvedState = step.label === request.stage && currentTaskIndex >= 0
                          ? taskIndex < currentTaskIndex ? "complete" : taskIndex === currentTaskIndex ? "active" : "pending"
                          : taskState;
                        return <li key={name} className={`dpl-check-${resolvedState}`}>
                          {resolvedState === "complete" ? <Check size={14} /> : resolvedState === "active" ? <span className="dpl-active-dot" /> : <Circle size={14} />}
                          <span>{name}</span>
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
  const [recordView, setRecordView] = useState<"dashboard" | "template">("dashboard");

  useEffect(() => {
    setRecordView("dashboard");
  }, [selectedRequestName]);

  const recordTemplateId = selectedRequest?.requestId ?? "request-template";
  const recordViewControls = <div className="dpl-record-view-switch" aria-label="Request workspace views">
    <button type="button" className={recordView === "dashboard" ? "active" : ""} onClick={() => setRecordView("dashboard")}>Lifecycle Tracker</button>
    <button type="button" className={recordView === "template" ? "active" : ""} onClick={() => setRecordView("template")}>STXAD Jira</button>
  </div>;

  return (
    <aside className={`dpl-dashboard${mode === "businessCase" ? " dpl-dashboard-workspace" : ""}${overlay ? " dpl-dashboard-overlay" : ""}`} style={{ minHeight: 0, overflow: "hidden" }}>
      {mode === "businessCase" ? <section className="dpl-panel dpl-workspace-shell"><div className="dpl-section-heading"><div><h2>Request Workspace</h2><p>Draft and refine the information needed for this request.</p></div></div>{businessCaseId?.startsWith("business-requirements-") ? <BusinessRequirementsTemplate key={businessCaseId} businessCaseId={businessCaseId} /> : businessCaseId?.startsWith("technical-design-") ? <TechnicalDesignTemplate key={businessCaseId} businessCaseId={businessCaseId} /> : intentTemplate ? <IntentTemplateForm key={businessCaseId} businessCaseId={businessCaseId ?? "new-intent-template"} template={intentTemplate[1]} /> : <BusinessCaseTemplate key={businessCaseId ?? "new-business-case"} businessCaseId={businessCaseId ?? "new-business-case"} />}</section> : mode === "record" && selectedRequest ? recordView === "dashboard" ? <CurrentProcess request={selectedRequest} viewControls={recordViewControls} /> : <section className="dpl-panel dpl-workspace-shell dpl-record-template"><div className="dpl-section-heading">{recordViewControls}</div><BusinessRequirementsTemplate key={`${recordTemplateId}-business-requirements`} businessCaseId={recordTemplateId} /></section> : <section className="dpl-panel dpl-context-placeholder"><LayoutGrid size={18} aria-hidden="true" /><h2>Contextual workspace</h2><p>Select an intention to open a supporting template, or select a request to view its lifecycle dashboard.</p></section>}
    </aside>
  );
}
