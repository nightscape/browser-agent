import {
  ChevronDown,
  Check,
  Circle,
  Clock3,
  ExternalLink,
  Info,
  LayoutGrid,
  List,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  { name: "C7", requestId: "TRD-2024-001", requestJira: "EXDPL-1041", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-001", title: "C7 Trading Data Product", requester: "Natali Karlova-B.", domain: "Trading", businessJira: "EXDPL-1042", technicalJira: "EXDPL-1043", intent: "Create data product", stage: "Design", currentSubstep: "Technical Design Review", currentOwner: "Delivery Team Lead", sla: "3 days left", decision: "Awaiting review", updated: "Updated today", progress: 40, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Markus Meyer", itCounterpart: "Anna Müller", created: "May 14, 2024", action: "Review technical design" },
  { name: "MMPM", requestId: "GMP-2024-002", requestJira: "EXDPL-1044", atlanContractUrl: "https://atlan.example.com/contracts/GMP-2024-002", title: "MMPM Data Product", requester: "Andreas Müller", domain: "Global Markets & Products", businessJira: "EXDPL-1045", technicalJira: "EXDPL-1046", intent: "Create data product (POC available)", stage: "Analysis", currentSubstep: "Business Requirements Preparation", currentOwner: "Data Product Owner", sla: "Due tomorrow", decision: "Awaiting input", updated: "Updated 2h ago", progress: 60, status: "Waiting", dataProductOwner: "Andreas Müller", domainOwner: "Sofia Weber", itCounterpart: "David Klein", created: "May 12, 2024", action: "Complete business requirements" },
  { name: "Reference Data", requestId: "CLR-2024-003", requestJira: "EXDPL-1047", atlanContractUrl: "https://atlan.example.com/contracts/CLR-2024-003", title: "Reference Data Retirement", requester: "Daniel Peters", domain: "Clearing", businessJira: "EXDPL-1048", technicalJira: "EXDPL-1049", intent: "Request retirement", stage: "Retirement", currentSubstep: "Retirement completed", currentOwner: "Data Product Owner", sla: "Completed", decision: "Approved", updated: "Updated May 6", progress: 100, status: "Completed", dataProductOwner: "Daniel Peters", domainOwner: "Sabine Keller", itCounterpart: "Felix Roth", created: "May 06, 2024", action: "Retirement completed" },
  { name: "Orders & Quotes", requestId: "TRD-2024-004", requestJira: "EXDPL-1050", atlanContractUrl: "https://atlan.example.com/contracts/TRD-2024-004", title: "Orders & Quotes Quality Issue", requester: "Daniel Peters", domain: "Trading", businessJira: "EXDPL-1051", technicalJira: "EXDPL-1052", intent: "Report issue", stage: "Analysis", currentSubstep: "Business Requirements Review", currentOwner: "Data Product Owner", sla: "1 day left", decision: "Awaiting approval", updated: "Updated today", progress: 80, status: "In Progress", dataProductOwner: "Daniel Peters", domainOwner: "Julia Fischer", itCounterpart: "Martin Bauer", created: "May 10, 2024", action: "Review business requirements" },
  { name: "M2M", requestId: "RSK-2024-005", requestJira: "EXDPL-1053", atlanContractUrl: "https://atlan.example.com/contracts/RSK-2024-005", title: "M2M Product Enhancement", requester: "Natali Karlova-B.", domain: "Risk", businessJira: "EXDPL-1054", technicalJira: "EXDPL-1055", intent: "Enhance existing data product", stage: "Design", currentSubstep: "Cost Estimation & Delivery Planning", currentOwner: "Delivery Team Lead", sla: "5 days left", decision: "No decision yet", updated: "Updated yesterday", progress: 15, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Lena Hoffmann", itCounterpart: "Thomas Wagner", created: "May 08, 2024", action: "Prepare delivery plan" },
] as const;

type RequestedProcess = (typeof requestedProcesses)[number];

function BusinessCaseTemplate({ businessCaseId, onShowRecords }: { businessCaseId: string; onShowRecords: () => void }) {
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
      <div className="dpl-section-heading"><div><h2>One Pager</h2><p>Capture the request before it enters the Planning stage.</p></div><button type="button" className="dpl-link-button dpl-panel-nav" onClick={onShowRecords}><List size={13} />Request Records</button></div>
      <form ref={formRef} className="dpl-business-case-form" onInput={persistDraft}>
        <label><span>Data Product Type</span><input name="productType" aria-label="Data Product Type" value="IT-driven Data Product" readOnly /></label>
        <label><span>Ownership</span><select name="ownership" aria-label="Ownership" defaultValue=""><option value="" disabled>Select a domain</option><option>Trading</option><option>Clearing</option><option>Risk</option><option>Global Markets & Products</option></select></label>
        <label className="dpl-business-case-full"><span>Purpose</span><textarea name="purpose" aria-label="Purpose" rows={2} placeholder="Captured purpose" /></label>
        <label className="dpl-business-case-full"><span>Contents</span><textarea name="contents" aria-label="Contents" rows={2} placeholder="Captured entities" /></label>
        <label className="dpl-business-case-full"><span>Existing Data Products</span><textarea name="existingProducts" aria-label="Existing Data Products" rows={2} placeholder="Identified products or None" /></label>
        <label className="dpl-business-case-full"><span>Reuse Assessment</span><textarea name="reuseAssessment" aria-label="Reuse Assessment" rows={2} placeholder="Assessment findings" /></label>
        <label><span>AI Recommendation</span><input name="aiRecommendation" aria-label="AI Recommendation" defaultValue="" placeholder="Added after AI reuse assessment" readOnly /></label>
        <label><span>Requester Justification</span><input name="requesterJustification" aria-label="Requester Justification" placeholder="Required when applicable" /></label>
        <div className="dpl-business-case-section"><strong>Submission Details</strong><span>Complete these fields before submitting the One Pager.</span></div>
        <label className="dpl-business-case-full"><span>Benefits</span><textarea name="benefits" aria-label="Benefits" rows={2} placeholder="Business value, risk reduction, or operational efficiency" /></label>
        <label><span>Primary Consumers</span><input name="primaryConsumers" aria-label="Primary Consumers" placeholder="Business users or consuming systems" /></label>
        <label><span>Distribution Channel</span><select name="distributionChannel" aria-label="Distribution Channel" defaultValue=""><option value="" disabled>Select a channel</option><option>API</option><option>Dashboard</option><option>Report</option><option>Data Feed</option><option>File Delivery</option><option>Self-Service Access</option></select></label>
        <label className="dpl-business-case-full"><span>Key Characteristics</span><textarea name="keyCharacteristics" aria-label="Key Characteristics" rows={2} placeholder="Real-Time, End-of-Day, Regulatory, Reusable, Critical, Internal, External" /></label>
        <label><span>Estimated Investment</span><select name="investmentBracket" aria-label="Estimated Investment" defaultValue=""><option value="" disabled>Select an investment bracket</option><option>Less than EUR 50k</option><option>EUR 50k-EUR 200k</option><option>EUR 200k-EUR 500k</option><option>More than EUR 500k</option><option>Unknown</option></select></label>
        <label><span>Business Sponsor</span><input name="businessSponsor" aria-label="Business Sponsor" placeholder="VP, Director, or Head of Unit" /></label>
        <div className="dpl-business-case-actions"><button type="button" className="dpl-business-case-submit">Submit</button></div>
      </form>
    </section>
  );
}

function RunningRequestsOverview({ selectedRequestName, onSelectRequest }: { selectedRequestName: string | null; onSelectRequest: (name: string) => void }) {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const visibleProcesses = selectedStatus === "All"
    ? requestedProcesses
    : requestedProcesses.filter((process) => process.status === selectedStatus);

  return (
    <section className="dpl-panel dpl-running-overview" aria-label="Running requests overview">
      <div className="dpl-section-heading"><div><h2>Request Records</h2><p>Track the requests assigned to you and their current action.</p></div><div className="dpl-overview-header-note"><Info size={14} /><span>Select a request to view its lifecycle dashboard.</span></div></div>
      <div className="dpl-process-tabs" aria-label="Request status filter">
        {['All', 'In Progress', 'Waiting', 'Completed'].map((tab) => (
          <button key={tab} type="button" className={tab === selectedStatus ? "active" : ""} onClick={() => setSelectedStatus(tab)}>{tab}</button>
        ))}
      </div>
      <div className="dpl-overview-list" aria-label="Request records">
        {visibleProcesses.map((request) => (
          <div className={`dpl-overview-request ${request.name === selectedRequestName ? "dpl-selected-request" : ""}`} key={request.name} role="button" tabIndex={0} onClick={() => onSelectRequest(request.name)} onKeyDown={(event) => {
            if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onSelectRequest(request.name);
            }
          }}>
            <span className={`dpl-table-status ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span>
            <div className="dpl-request-record-title"><strong>{request.title}</strong><span>{request.requestId}</span></div>
            <div className="dpl-request-record-details">
              <div><span>Requester</span><strong>{request.requester}</strong></div>
              <div><span>Domain</span><strong>{request.domain}</strong></div>
              <div className="dpl-request-record-atlan"><span>Atlan Contract</span><a href={request.atlanContractUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Open contract <ExternalLink size={12} aria-hidden="true" /></a></div>
              <div><span>Creation Date</span><strong>{request.created}</strong></div>
              <div className="dpl-request-record-jira"><span>Request Jira</span><strong>{request.requestJira}</strong></div>
              <div className="dpl-request-record-jira"><span>Requirements Jira</span><strong>{request.businessJira}</strong></div>
              <div className="dpl-request-record-jira"><span>Technical Design Jira</span><strong>{request.technicalJira}</strong></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CurrentProcess({ request, onShowRecords }: { request: RequestedProcess; onShowRecords: () => void }) {
  const activeStepIndex = lifecycle.findIndex(
    (step) => step.shortLabel === request.stage || step.label.startsWith(request.stage),
  );
  const [openStage, setOpenStage] = useState<string>(lifecycle[activeStepIndex]?.label ?? lifecycle[0].label);
  const completedStages = request.status === "Completed" ? lifecycle.length : Math.max(activeStepIndex, 0);
  const lifecycleProgress = Math.round((completedStages / lifecycle.length) * 100);

  return (
    <section className="dpl-panel dpl-current-process" aria-label="Selected request" style={{ flex: "1 1 0", minHeight: 0, overflowX: "hidden", overflowY: "auto" }}>
      <div className="dpl-section-heading dpl-record-header">
        <div className="dpl-record-heading"><span>{request.requestId}</span><h2>{request.title}</h2></div>
        <span className={`dpl-status-badge ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span>
        <button type="button" className="dpl-link-button dpl-panel-nav" onClick={onShowRecords}><List size={13} />Request Records</button>
      </div>
      <div className="dpl-tracker">
        <div className="dpl-tracker-header">
          <h3>Lifecycle Tracker</h3>
        </div>
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

export function LifecycleDashboard({ selectedRequestName, mode, businessCaseId, onSelectRequest, onShowRecords }: { selectedRequestName: string | null; mode: "overview" | "record" | "businessCase"; businessCaseId: string | null; onSelectRequest: (name: string) => void; onShowRecords: () => void }) {
  const selectedRequest = selectedRequestName ? requestedProcesses.find((request) => request.name === selectedRequestName) : undefined;

  return (
    <aside className="dpl-dashboard" style={{ minHeight: 0, overflow: "hidden" }}>
      {mode === "businessCase" ? <BusinessCaseTemplate key={businessCaseId ?? "new-business-case"} businessCaseId={businessCaseId ?? "new-business-case"} onShowRecords={onShowRecords} /> : mode === "record" && selectedRequest ? <CurrentProcess request={selectedRequest} onShowRecords={onShowRecords} /> : <RunningRequestsOverview selectedRequestName={selectedRequestName} onSelectRequest={onSelectRequest} />}
    </aside>
  );
}
