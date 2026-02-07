"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Upload,
  RefreshCw,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Phone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { makeOutboundCall } from "@/lib/elevenlabs";
import Papa from "papaparse";
import type { Contact } from "@/types/database";

const PAGE_SIZE = 20;

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manuel",
  import: "Import",
  widget: "Widget",
  campaign: "Campagne",
};

const SOURCE_BADGE: Record<string, string> = {
  manual: "badge-info",
  import: "badge-neutral",
  widget: "badge-success",
  campaign: "badge-warning",
};

// ===================== ADD CONTACT MODAL =====================
function AddContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    company: "",
    city: "",
    tags: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast.error("Le prenom est requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Non connecte"); return; }
      const { error } = await supabase.from("contacts").insert({
        user_id: user.id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        city: form.city.trim() || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
        source: "manual",
        country: "FR",
      });
      if (error) throw error;
      toast.success("Contact ajoute avec succes");
      onCreated();
    } catch {
      toast.error("Erreur lors de la creation du contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "white",
          borderRadius: "0.75rem",
          width: "100%",
          maxWidth: "500px",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>
            Nouveau contact
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Prenom *</label>
              <input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Telephone</label>
              <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Entreprise</label>
              <input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Tags (separes par des virgules)</label>
            <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, prospect, client" />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label className="label">Notes</label>
            <textarea
              className="input-field"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Ajouter le contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== IMPORT CSV MODAL =====================
function ImportCSVModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const data = result.data as Record<string, string>[];
        setPreview(data.slice(0, 5));
        if (data.length === 0) {
          toast.error("Le fichier CSV est vide");
        }
      },
      error: () => {
        toast.error("Erreur lors de la lecture du fichier CSV");
      },
    });
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Veuillez selectionner un fichier CSV");
      return;
    }

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data as Record<string, string>[];
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { toast.error("Non connecte"); setImporting(false); return; }
          const contacts = rows.map((row) => ({
            user_id: user.id,
            first_name: row.prenom || row.first_name || row.Prenom || row.nom || "Inconnu",
            last_name: row.nom_famille || row.last_name || row.Nom || "",
            phone: row.telephone || row.phone || row.Phone || row.Tel || null,
            email: row.email || row.Email || null,
            company: row.entreprise || row.company || row.Company || null,
            city: row.ville || row.city || row.City || null,
            tags: (row.tags || row.Tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
            notes: row.notes || row.Notes || "",
            source: "import" as const,
            country: "FR",
          }));

          const { error } = await supabase.from("contacts").insert(contacts);
          if (error) throw error;

          toast.success(`${contacts.length} contacts importes avec succes`);
          onImported();
        } catch {
          toast.error("Erreur lors de l'import des contacts");
        } finally {
          setImporting(false);
        }
      },
      error: () => {
        toast.error("Erreur lors de la lecture du fichier");
        setImporting(false);
      },
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "white",
          borderRadius: "0.75rem",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          overflow: "auto",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>
            Importer des contacts (CSV)
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.75rem" }}>
            Colonnes attendues : <strong>prenom, nom_famille, telephone, email, entreprise, ville, tags, notes</strong>
          </p>
          <div
            style={{
              border: "2px dashed #d1d5db",
              borderRadius: "0.5rem",
              padding: "2rem",
              textAlign: "center",
              cursor: "pointer",
              backgroundColor: "#f9fafb",
            }}
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet size={32} style={{ color: "#9ca3af", margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
              {fileName || "Cliquez pour selectionner un fichier CSV"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151", marginBottom: "0.5rem" }}>
              Apercu ({preview.length} premieres lignes) :
            </p>
            <div className="table-container" style={{ maxHeight: "200px", overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {Object.keys(preview[0]).map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j}>{String(val).substring(0, 40)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleImport}
            className="btn-primary"
            disabled={importing || !fileName}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Upload size={16} />
            {importing ? "Importation..." : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== EDIT CONTACT MODAL =====================
function EditContactModal({
  contact,
  onClose,
  onUpdated,
}: {
  contact: Contact;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    phone: contact.phone || "",
    email: contact.email || "",
    company: contact.company || "",
    city: contact.city || "",
    tags: contact.tags?.join(", ") || "",
    notes: contact.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast.error("Le prenom est requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("contacts").update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        company: form.company.trim() || null,
        city: form.city.trim() || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim(),
      }).eq("id", contact.id);
      if (error) throw error;
      toast.success("Contact mis a jour");
      onUpdated();
    } catch {
      toast.error("Erreur lors de la mise a jour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderRadius: "0.75rem", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflow: "auto", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>Modifier le contact</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Prenom *</label>
              <input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Telephone</label>
              <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="label">Entreprise</label>
              <input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Tags (separes par des virgules)</label>
            <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, prospect, client" />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label className="label">Notes</label>
            <textarea className="input-field" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== CALL CONTACT MODAL =====================
function CallContactModal({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<{ id: string; name: string; elevenlabs_agent_id: string }[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [calling, setCalling] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("agents")
        .select("id, name, elevenlabs_agent_id")
        .not("elevenlabs_agent_id", "is", null)
        .order("name");
      if (data) setAgents(data);
      setLoadingAgents(false);
    })();
  }, []);

  const handleCall = async () => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent) {
      toast.error("Selectionnez un agent");
      return;
    }
    if (!contact.phone) {
      toast.error("Ce contact n'a pas de numero de telephone");
      return;
    }
    setCalling(true);
    try {
      const result = await makeOutboundCall(agent.elevenlabs_agent_id, agent.id, contact.phone);
      if (result.ok) {
        toast.success(`Appel lance vers ${contact.first_name} ${contact.last_name}`);
        onClose();
      } else {
        toast.error("Erreur lors du lancement de l'appel");
      }
    } catch (err) {
      toast.error((err as Error).message || "Erreur lors de l'appel");
    } finally {
      setCalling(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderRadius: "0.75rem", width: "100%", maxWidth: "400px", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", margin: 0 }}>Appeler {contact.first_name}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "0.25rem" }}><X size={20} /></button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.25rem" }}>Numero</div>
          <div style={{ fontWeight: 500, color: "#111827" }}>{contact.phone || "Aucun numero"}</div>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label className="label">Agent</label>
          {loadingAgents ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#9ca3af", fontSize: "0.875rem" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Chargement...
            </div>
          ) : agents.length === 0 ? (
            <p style={{ color: "#ef4444", fontSize: "0.875rem" }}>Aucun agent disponible. Creez d&apos;abord un agent.</p>
          ) : (
            <select
              className="input-field"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">Choisir un agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleCall}
            className="btn-primary"
            disabled={calling || !selectedAgentId || !contact.phone}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            {calling ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Phone size={14} />}
            {calling ? "Appel en cours..." : "Appeler"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== MAIN PAGE =====================
export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [callingContact, setCallingContact] = useState<Contact | null>(null);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search.trim()) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
        );
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setContacts((data as Contact[]) || []);
      setTotalCount(count || 0);
    } catch {
      toast.error("Erreur lors du chargement des contacts");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce contact ?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Contact supprime");
      fetchContacts();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>
            Contacts
          </h1>
          <p style={{ color: "#6b7280", marginTop: "0.25rem", fontSize: "0.875rem" }}>
            Gerez votre base de contacts
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={fetchContacts} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <RefreshCw size={16} />
            Actualiser
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Upload size={16} />
            Importer CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Plus size={16} />
            Nouveau contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: "2.25rem" }}
            placeholder="Rechercher par nom, telephone, email ou entreprise..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
          <div style={{
            width: "2rem",
            height: "2rem",
            border: "4px solid #FFEDD5",
            borderTopColor: "#F97316",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
        </div>
      ) : contacts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Users size={48} className="empty-state-icon" />
            <p className="empty-state-title">Aucun contact</p>
            <p className="empty-state-desc">
              {search ? "Aucun contact ne correspond a votre recherche" : "Ajoutez votre premier contact ou importez un fichier CSV"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Telephone</th>
                  <th>Email</th>
                  <th>Entreprise</th>
                  <th>Ville</th>
                  <th>Tags</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td style={{ fontWeight: 500, color: "#111827" }}>
                      {contact.first_name} {contact.last_name}
                    </td>
                    <td>{contact.phone || "—"}</td>
                    <td>{contact.email || "—"}</td>
                    <td>{contact.company || "—"}</td>
                    <td>{contact.city || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {contact.tags?.length > 0
                          ? contact.tags.map((tag) => (
                              <span key={tag} className="badge badge-info" style={{ fontSize: "0.6875rem" }}>
                                {tag}
                              </span>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${SOURCE_BADGE[contact.source] || "badge-neutral"}`}>
                        {SOURCE_LABELS[contact.source] || contact.source}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {contact.phone && (
                          <button
                            className="btn-ghost"
                            style={{ padding: "0.25rem", color: "#2563EB" }}
                            title="Appeler"
                            onClick={() => setCallingContact(contact)}
                          >
                            <Phone size={14} />
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          style={{ padding: "0.25rem", color: "#6b7280" }}
                          title="Modifier"
                          onClick={() => setEditingContact(contact)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ padding: "0.25rem", color: "#ef4444" }}
                          title="Supprimer"
                          onClick={() => handleDelete(contact.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                {totalCount} contact{totalCount > 1 ? "s" : ""} au total
              </span>
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      className={`pagination-btn ${page === p ? "active" : ""}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            fetchContacts();
          }}
        />
      )}
      {showImportModal && (
        <ImportCSVModal
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            setShowImportModal(false);
            fetchContacts();
          }}
        />
      )}
      {editingContact && (
        <EditContactModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onUpdated={() => {
            setEditingContact(null);
            fetchContacts();
          }}
        />
      )}
      {callingContact && (
        <CallContactModal
          contact={callingContact}
          onClose={() => setCallingContact(null)}
        />
      )}
    </div>
  );
}
