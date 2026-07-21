import {
  Check,
  Circle,
  FileText,
  Info,
  LayoutGrid,
} from "lucide-react";
import { useState } from "react";

const lifecycle = [
  { label: "Inception", shortLabel: "Inception", state: "complete" },
  { label: "Design", shortLabel: "Design", state: "complete" },
  { label: "Build", shortLabel: "Build", state: "active" },
  { label: "Test", shortLabel: "Test", state: "pending" },
  { label: "Deployment", shortLabel: "Deploy", state: "pending" },
  { label: "Monitoring", shortLabel: "Monitor", state: "pending" },
  { label: "Retirement", shortLabel: "Retire", state: "pending" },
] as const;

const requestedProcesses = [
  { name: "C7", intent: "Create data product", stage: "Build", progress: 40, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Markus Meyer", itCounterpart: "Anna Müller", created: "May 14, 2024", action: "Complete pipeline development" },
  { name: "MMPM", intent: "Create data product (POC available)", stage: "Build", progress: 60, status: "Waiting", dataProductOwner: "Andreas Müller", domainOwner: "Sofia Weber", itCounterpart: "David Klein", created: "May 12, 2024", action: "Approve data model" },
  { name: "Reference Data", intent: "Request retirement", stage: "Retire", progress: 100, status: "Completed", dataProductOwner: "Daniel Peters", domainOwner: "Sabine Keller", itCounterpart: "Felix Roth", created: "May 06, 2024", action: "Retirement completed" },
  { name: "Orders & Quotes", intent: "Report issue", stage: "Test", progress: 80, status: "In Progress", dataProductOwner: "Daniel Peters", domainOwner: "Julia Fischer", itCounterpart: "Martin Bauer", created: "May 10, 2024", action: "Review quality rules" },
  { name: "M2M", intent: "Enhance existing data product", stage: "Deploy", progress: 15, status: "In Progress", dataProductOwner: "Natali Karlova-B.", domainOwner: "Lena Hoffmann", itCounterpart: "Thomas Wagner", created: "May 08, 2024", action: "Prepare deployment" },
] as const;

type RequestedProcess = (typeof requestedProcesses)[number];

function CurrentProcess({ request }: { request: RequestedProcess }) {
  const tasks = [
    ["Data model defined", "complete"],
    ["Source systems identified", "complete"],
    ["Pipeline development", "active"],
    ["Data validation", "pending"],
    ["Documentation", "pending"],
  ] as const;
  const activeStepIndex = lifecycle.findIndex(
    (step) => step.shortLabel === request.stage || step.label.startsWith(request.stage),
  );

  return (
    <section className="dpl-panel dpl-current-process" aria-label="Selected request">
      <div className="dpl-section-heading">
        <h2>Selected Request <span className={`dpl-status-badge ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span></h2>
      </div>
      <div className="dpl-process-metadata">
        <div><span>Request Name</span><strong>{request.name}</strong></div>
        <div><span>Intent</span><strong>{request.intent}</strong></div>
        <div><span>Data Product Owner</span><strong>{request.dataProductOwner}</strong></div>
        <div><span>IT Counterpart</span><strong>{request.itCounterpart}</strong></div>
      </div>
      <div className="dpl-tracker">
        <div className="dpl-tracker-header">
          <h3>Lifecycle Tracker</h3>
        </div>
        <div className="dpl-stepper" aria-label="Lifecycle tracker">
          {Array.from({ length: lifecycle.length - 1 }, (_, index) => (
            <span
              className="dpl-lifecycle-connector"
              aria-hidden="true"
              key={index}
              style={{
                position: "absolute",
                top: "1.2rem",
                left: `calc(${7.142857 + index * 14.285714}% + .75rem)`,
                zIndex: 0,
                width: "calc(14.285714% - 1.5rem)",
                height: "0.5px",
                background: "#00CE7D",
                pointerEvents: "none",
              }}
            />
          ))}
          {lifecycle.map((step, index) => (
            (() => {
              const state = request.status === "Completed" || index < activeStepIndex
                ? "complete"
                : index === activeStepIndex ? "active" : "pending";
              return <div className={`dpl-step dpl-lifecycle-${state}`} key={step.label} title={step.label}>
              <span className={`dpl-step-icon dpl-step-${state}`}>
                {state === "complete" ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className="dpl-step-label">{step.shortLabel}</span>
              </div>;
            })()
          ))}
        </div>
      </div>
      <div className="dpl-current-details">
        <div className="dpl-section-heading">
          <h2>Current Step: {request.stage} <span className={`dpl-status-badge ${request.status.toLowerCase().replace(/\s+/g, "-")}`}>{request.status}</span></h2>
        </div>
        <p className="dpl-description">Implement data pipelines, models, and components.</p>
        <h3>Sub-tasks</h3>
        <ul className="dpl-checklist">
          {tasks.map(([name, state]) => (
            <li key={name} className={`dpl-check-${state}`}>
              {state === "complete" ? <Check size={14} /> : state === "active" ? <span className="dpl-active-dot" /> : <Circle size={14} />}
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </div>
      <AgentFiles requestName={request.name} />
    </section>
  );
}

function AgentFiles({ requestName }: { requestName: string }) {
  const files = [
    { name: `${requestName} Assessment Report`, created: "May 14, 2024" },
    { name: `${requestName} Business Data Contract`, created: "May 14, 2024" },
    { name: `${requestName} Data Quality Report`, created: "May 13, 2024" },
    { name: `${requestName} Technical Data Contract`, created: "May 12, 2024" },
    { name: `${requestName} Pipeline Specification`, created: "May 11, 2024" },
    { name: `${requestName} Release Notes`, created: "May 10, 2024" },
  ] as const;

  return (
    <section className="dpl-panel dpl-agent-files" aria-label="Generated files">
      <div className="dpl-section-heading">
        <h2>Generated Files</h2>
      </div>
      <div className="dpl-agent-file-columns"><span>File</span><span>Created on</span></div>
      <div className="dpl-agent-file-list">
        {files.map((file) => (
          <button type="button" className="dpl-agent-file" key={file.name}>
            <FileText size={15} />
            <strong>{file.name}</strong><small>{file.created}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LifecycleDashboard({ selectedRequestName }: { selectedRequestName: string }) {
  const selectedRequest = requestedProcesses.find((request) => request.name === selectedRequestName) ?? requestedProcesses[0];

  return (
    <aside className="dpl-dashboard">
      <CurrentProcess request={selectedRequest} />
    </aside>
  );
}

export function RequestedProcesses({
  selectedRequestName,
  onSelectRequest,
}: {
  selectedRequestName: string;
  onSelectRequest: (name: string) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const visibleProcesses = selectedStatus === "All"
    ? requestedProcesses
    : requestedProcesses.filter((process) => process.status === selectedStatus);

  return (
    <section className="dpl-panel dpl-processes" aria-label="Requested processes">
      <div className="dpl-section-heading">
        <div><h2>My Requests</h2><p>Initiated requests. Complete, cancel or archive them.</p></div>
        <div className="dpl-process-tabs" aria-label="Process status filter">
          {['All', 'In Progress', 'Waiting', 'Completed'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === selectedStatus ? "active" : ""}
              onClick={() => setSelectedStatus(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="dpl-table-wrap">
        <table>
          <thead><tr><th>Request</th><th>Intent</th><th>Status</th><th>Data Product Owner</th><th>Domain Owner</th><th>IT Counterpart</th><th>Lifecycle Stage</th><th>Next Task</th><th>Created on</th></tr></thead>
          <tbody>
            {visibleProcesses.map((process) => (
              <tr
                key={process.name}
                className={process.name === selectedRequestName ? "dpl-selected-request" : ""}
                onClick={() => onSelectRequest(process.name)}
              >
                <td><LayoutGrid size={14} /> <strong>{process.name}</strong></td>
                <td>{process.intent}</td>
                <td><span className={`dpl-table-status ${process.status.toLowerCase().replace(/\s+/g, "-")}`}>{process.status}</span></td>
                <td>{process.dataProductOwner}</td><td>{process.domainOwner}</td><td>{process.itCounterpart}</td>
                <td className="dpl-stage"><span />{process.stage}</td><td className="dpl-next-action">{process.action}</td><td>{process.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
