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
  AlertTriangle,
  FileSpreadsheet,
  Phone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { makeOutboundCall } from "@/lib/elevenlabs";
import { AnimatePresence, motion } from "framer-motion";
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-auto p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">Nouveau contact</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Prenom *</label>
              <input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Telephone</label>
              <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Entreprise</label>
              <input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Tags (separes par des virgules)</label>
            <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, prospect, client" />
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea className="input-field resize-y" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Ajouter le contact"}
            </button>
          </div>
        </form>
      </motion.div>
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl w-full max-w-[600px] max-h-[90vh] overflow-auto p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">Importer des contacts (CSV)</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-slate-500 mb-3">
            Colonnes attendues : <strong>prenom, nom_famille, telephone, email, entreprise, ville, tags, notes</strong>
          </p>
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet size={32} className="text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {fileName || "Cliquez pour selectionner un fichier CSV"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {preview.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Apercu ({preview.length} premieres lignes) :
            </p>
            <div className="table-container max-h-[200px] overflow-auto">
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

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleImport}
            className="btn-primary flex items-center gap-2"
            disabled={importing || !fileName}
          >
            <Upload size={16} />
            {importing ? "Importation..." : "Importer"}
          </button>
        </div>
      </motion.div>
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl w-full max-w-[500px] max-h-[90vh] overflow-auto p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">Modifier le contact</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Prenom *</label>
              <input className="input-field" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="input-field" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Telephone</label>
              <input className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Entreprise</label>
              <input className="input-field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="input-field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Tags (separes par des virgules)</label>
            <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, prospect, client" />
          </div>
          <div className="mb-6">
            <label className="label">Notes</label>
            <textarea className="input-field resize-y" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </motion.div>
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingAgents(false); return; }
      const { data } = await supabase
        .from("agents")
        .select("id, name, elevenlabs_agent_id")
        .eq("user_id", user.id)
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl w-full max-w-[400px] p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-slate-900 m-0">Appeler {contact.first_name}</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={20} /></button>
        </div>

        <div className="mb-4">
          <div className="text-sm text-slate-500 mb-1">Numero</div>
          <div className="font-medium text-slate-900">{contact.phone || "Aucun numero"}</div>
        </div>

        <div className="mb-6">
          <label className="label">Agent</label>
          {loadingAgents ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Chargement...
            </div>
          ) : agents.length === 0 ? (
            <p className="text-red-500 text-sm">Aucun agent disponible. Creez d&apos;abord un agent.</p>
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

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Annuler</button>
          <button
            onClick={handleCall}
            className="btn-primary flex items-center gap-2"
            disabled={calling || !selectedAgentId || !contact.phone}
          >
            {calling ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            {calling ? "Appel en cours..." : "Appeler"}
          </button>
        </div>
      </motion.div>
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      let query = supabase
        .from("contacts")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
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

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("contacts").delete().eq("id", deleteTarget);
      if (error) throw error;
      toast.success("Contact supprime");
      fetchContacts();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
    setDeleteTarget(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Contacts</h1>
          <p className="text-sm text-slate-500 mt-1">Gerez votre base de contacts</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchContacts} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Actualiser
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Importer CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nouveau contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input-field pl-9"
            placeholder="Rechercher par nom, telephone, email ou entreprise..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
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
                  <th className="hidden md:table-cell">Email</th>
                  <th className="hidden lg:table-cell">Entreprise</th>
                  <th className="hidden lg:table-cell">Ville</th>
                  <th className="hidden md:table-cell">Tags</th>
                  <th className="hidden md:table-cell">Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="font-medium text-slate-900">
                      {contact.first_name} {contact.last_name}
                    </td>
                    <td>{contact.phone || "—"}</td>
                    <td className="hidden md:table-cell">{contact.email || "—"}</td>
                    <td className="hidden lg:table-cell">{contact.company || "—"}</td>
                    <td className="hidden lg:table-cell">{contact.city || "—"}</td>
                    <td className="hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags?.length > 0
                          ? contact.tags.map((tag) => (
                              <span key={tag} className="badge badge-info text-[0.6875rem]">{tag}</span>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className={`badge ${SOURCE_BADGE[contact.source] || "badge-neutral"}`}>
                        {SOURCE_LABELS[contact.source] || contact.source}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {contact.phone && (
                          <button className="btn-ghost p-1 text-blue-600" title="Appeler" onClick={() => setCallingContact(contact)}>
                            <Phone size={14} />
                          </button>
                        )}
                        <button className="btn-ghost p-1 text-slate-500" title="Modifier" onClick={() => setEditingContact(contact)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-ghost p-1 text-red-500" title="Supprimer" onClick={() => setDeleteTarget(contact.id)}>
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
            <div className="flex items-center justify-between mt-4">
              <span className="text-[0.8125rem] text-slate-500">
                {totalCount} contact{totalCount > 1 ? "s" : ""} au total
              </span>
              <div className="pagination">
                <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
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
                <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDeleteTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <h2 className="text-lg font-bold m-0 text-slate-900">Supprimer le contact</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                Cette action est irreversible. Le contact sera definitivement supprime.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Annuler</button>
                <button onClick={confirmDelete} className="btn-primary flex items-center gap-1" style={{ backgroundColor: "#DC2626" }}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <AddContactModal
            onClose={() => setShowAddModal(false)}
            onCreated={() => { setShowAddModal(false); fetchContacts(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showImportModal && (
          <ImportCSVModal
            onClose={() => setShowImportModal(false)}
            onImported={() => { setShowImportModal(false); fetchContacts(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingContact && (
          <EditContactModal
            contact={editingContact}
            onClose={() => setEditingContact(null)}
            onUpdated={() => { setEditingContact(null); fetchContacts(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {callingContact && (
          <CallContactModal
            contact={callingContact}
            onClose={() => setCallingContact(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
