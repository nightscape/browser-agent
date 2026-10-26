import { LockKeyhole, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AccessRole = "owner" | "editor" | "reader";
type AccessEntry = { id: string; name: string; kind: "user" | "group"; role: AccessRole; canRun: boolean };
const storageKey = (requestName: string) => `dpl-request-access:${requestName}`;

function loadAccess(requestName: string, owner: string): AccessEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(requestName)) ?? "null");
    if (Array.isArray(saved) && saved.length && saved.every((entry) =>
      entry && typeof entry.id === "string" && typeof entry.name === "string" &&
      ["user", "group"].includes(entry.kind) && ["owner", "editor", "reader"].includes(entry.role) && typeof entry.canRun === "boolean") &&
      saved.some((entry) => entry.role === "owner")) return saved;
  } catch {}
  return [{ id: crypto.randomUUID(), name: owner, kind: "user", role: "owner", canRun: true }];
}

export function RequestAccessButton({ requestName, requestTitle, owner }: { requestName: string; requestTitle: string; owner: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"user" | "group">("user");
  const [role, setRole] = useState<AccessRole>("reader");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);

  const updateEntries = (next: AccessEntry[]) => {
    if (!next.some((entry) => entry.role === "owner")) {
      setError("Keep at least one owner for this request.");
      return;
    }
    setEntries(next);
    setError("");
  };

  const addEntry = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (entries.some((entry) => entry.kind === kind && entry.name.toLowerCase() === trimmedName.toLowerCase())) {
      setError("This user or group already has access settings.");
      return;
    }
    updateEntries([...entries, { id: crypto.randomUUID(), name: trimmedName, kind, role, canRun: role === "owner" }]);
    setName("");
  };

  return <>
    <button type="button" className="dpl-request-access-button" title="Manage access" aria-label={`Manage access for ${requestTitle}`} onClick={(event) => {
      event.stopPropagation();
      setEntries(loadAccess(requestName, owner));
      setName("");
      setKind("user");
      setRole("reader");
      setError("");
      setOpen(true);
    }}><LockKeyhole size={14} aria-hidden="true" /></button>
    <dialog ref={dialogRef} className="dpl-access-dialog" aria-labelledby={`access-title-${requestName}`} aria-describedby={`access-note-${requestName}`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          setError("Add the entered user or group before saving, or clear the name.");
          return;
        }
        try {
          localStorage.setItem(storageKey(requestName), JSON.stringify(entries));
          setOpen(false);
        } catch {
          setError("Access settings could not be saved. Please try again.");
        }
      }}>
        <header><div><h2 id={`access-title-${requestName}`}>Manage access</h2><p>{requestTitle}</p></div><button type="button" className="dpl-access-icon" title="Close" aria-label="Close access settings" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <p className="dpl-access-notice" id={`access-note-${requestName}`}>Local access settings only. Permissions are not enforced or shared. Jira and Confluence access is unchanged.</p>
        <div className="dpl-access-role-guide"><p><strong>Owner</strong> Manage access, edit, run workflows, and archive.</p><p><strong>Editor</strong> Edit request details, conversations, and linked Jira tickets.</p><p><strong>Reader</strong> View request details, lifecycle, conversations, and Jira information.</p></div>
        <div className="dpl-access-members">
          {entries.map((entry) => <div className="dpl-access-member" key={entry.id}>
            <div className="dpl-access-member-name"><strong>{entry.name}</strong><span>{entry.kind === "group" ? "Group" : "User"}</span></div>
            <select aria-label={`Role for ${entry.name}`} value={entry.role} onChange={(event) => {
              const nextRole = event.target.value as AccessRole;
              updateEntries(entries.map((item) => item.id === entry.id ? { ...item, role: nextRole, canRun: nextRole === "owner" ? true : item.role === "owner" ? false : item.canRun } : item));
            }}><option value="owner">Owner</option><option value="editor">Editor</option><option value="reader">Reader</option></select>
            <label className="dpl-access-run"><input type="checkbox" checked={entry.role === "owner" || entry.canRun} disabled={entry.role === "owner"} onChange={(event) => updateEntries(entries.map((item) => item.id === entry.id ? { ...item, canRun: event.target.checked } : item))} />Can run workflows</label>
            <button type="button" className="dpl-access-icon" title={`Remove ${entry.name}`} aria-label={`Remove ${entry.name}`} onClick={() => updateEntries(entries.filter((item) => item.id !== entry.id))}><Trash2 size={15} /></button>
          </div>)}
        </div>
        <fieldset className="dpl-access-add"><legend>Add user or group</legend>
          <select aria-label="Member type" value={kind} onChange={(event) => setKind(event.target.value as "user" | "group")}><option value="user">User</option><option value="group">Group</option></select>
          <input aria-label="User or group name" placeholder="Name or email" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEntry(); } }} />
          <select aria-label="New member role" value={role} onChange={(event) => setRole(event.target.value as AccessRole)}><option value="reader">Reader</option><option value="editor">Editor</option><option value="owner">Owner</option></select>
          <button type="button" className="dpl-access-icon" title="Add member" aria-label="Add member" disabled={!name.trim()} onClick={addEntry}><Plus size={18} /></button>
        </fieldset>
        {error && <p className="dpl-access-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit">Save settings</button></footer>
      </form>
    </dialog>
  </>;
}