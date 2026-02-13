"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Pause,
  UserPlus,
  Phone,
  Clock,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import type { CampaignGroup, CampaignContact, Contact } from "@/types/database";

interface CampaignWithAgent extends CampaignGroup {
  agent?: { name: string; elevenlabs_agent_id: string } | null;
}

interface CampaignContactWithContact extends Omit<CampaignContact, "contact"> {
  contact?: Contact | null;
}

const contactStatusMap: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#f3f4f6", color: "#6b7280", label: "En attente" },
  calling: { bg: "#EFF6FF", color: "#2563EB", label: "Appel en cours" },
  answered: { bg: "#ECFDF5", color: "#059669", label: "Repondu" },
  no_answer: { bg: "#FEF3C7", color: "#D97706", label: "Non repondu" },
  busy: { bg: "#FEF3C7", color: "#D97706", label: "Occupe" },
  failed: { bg: "#FEE2E2", color: "#DC2626", label: "Echoue" },
  completed: { bg: "#dcfce7", color: "#15803d", label: "Termine" },
};

const campaignStatusMap: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: "#f3f4f6", color: "#6b7280", label: "Brouillon" },
  scheduled: { bg: "#EFF6FF", color: "#2563EB", label: "Planifiee" },
  running: { bg: "#ECFDF5", color: "#059669", label: "En cours" },
  paused: { bg: "#FEF3C7", color: "#D97706", label: "En pause" },
  completed: { bg: "#dcfce7", color: "#15803d", label: "Terminee" },
  cancelled: { bg: "#FEE2E2", color: "#DC2626", label: "Annulee" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.campaignId as string;

  const [campaign, setCampaign] = useState<CampaignWithAgent | null>(null);
  const [contacts, setContacts] = useState<CampaignContactWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);

  // Launch confirmation modal
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  // Add contacts modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [addingContacts, setAddingContacts] = useState(false);

  const fetchCampaign = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("campaign_groups")
      .select("*, agent:agents(name, elevenlabs_agent_id)")
      .eq("id", campaignId)
      .single();
    if (data) setCampaign(data as CampaignWithAgent);
  }, [campaignId]);

  const fetchContacts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("campaign_contacts")
      .select("*, contact:contacts(first_name, last_name, phone, email, company)")
      .eq("campaign_id", campaignId)
      .order("created_at");
    if (data) setContacts(data as CampaignContactWithContact[]);
  }, [campaignId]);

  useEffect(() => {
    Promise.all([fetchCampaign(), fetchContacts()]).finally(() => setLoading(false));
  }, [fetchCampaign, fetchContacts]);

  // Reconcile stuck "calling" contacts by triggering list-conversations
  useEffect(() => {
    if (!campaign?.agent?.elevenlabs_agent_id) return;

    const hasStuck = contacts.some(
      (c) => c.status === "calling" && c.called_at
        && Date.now() - new Date(c.called_at).getTime() > 3 * 60 * 1000
    );

    if (hasStuck) {
      const supabase = createClient();
      supabase.functions
        .invoke("list-conversations", {
          body: { elevenlabsAgentId: campaign.agent.elevenlabs_agent_id },
        })
        .then(() => {
          fetchCampaign();
          fetchContacts();
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length, campaign?.agent?.elevenlabs_agent_id]);

  // Realtime subscription for live updates during campaign
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`campaign-${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_contacts", filter: `campaign_id=eq.${campaignId}` }, () => {
        fetchContacts();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaign_groups", filter: `id=eq.${campaignId}` }, () => {
        fetchCampaign();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId, fetchCampaign, fetchContacts]);

  async function openAddModal() {
    setShowAddModal(true);
    setSelectedIds(new Set());
    setContactSearch("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const existingIds = contacts.map((c) => c.contact_id);
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .not("phone", "is", null)
      .order("first_name");
    if (data) {
      setAvailableContacts(data.filter((c: Contact) => !existingIds.includes(c.id)));
    }
  }

  async function handleAddContacts() {
    if (selectedIds.size === 0) return;
    setAddingContacts(true);
    const supabase = createClient();
    const rows = Array.from(selectedIds).map((contactId) => ({
      campaign_id: campaignId,
      contact_id: contactId,
      status: "pending" as const,
    }));
    const { error } = await supabase.from("campaign_contacts").insert(rows);
    if (error) {
      toast.error("Erreur lors de l'ajout");
    } else {
      await supabase
        .from("campaign_groups")
        .update({ total_contacts: (campaign?.total_contacts || 0) + rows.length })
        .eq("id", campaignId);
      toast.success(`${rows.length} contact(s) ajoute(s)`);
      setShowAddModal(false);
      fetchContacts();
      fetchCampaign();
    }
    setAddingContacts(false);
  }

  function handleLaunch() {
    if (!campaign?.agent_id) {
      toast.error("Associez un agent a cette campagne d'abord");
      return;
    }
    const pendingCount = contacts.filter((c) => c.status === "pending").length;
    if (pendingCount === 0) {
      toast.error("Aucun contact en attente a appeler");
      return;
    }
    setShowLaunchModal(true);
  }

  async function confirmLaunch() {
    setShowLaunchModal(false);
    setLaunching(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.functions.invoke("campaign-outbound-call", {
        body: { action: "start", campaign_id: campaignId },
      });
      if (error) throw error;
      toast.success("Campagne lancee !");
      fetchCampaign();
    } catch {
      toast.error("Erreur lors du lancement");
    } finally {
      setLaunching(false);
    }
  }

  async function handlePause() {
    const supabase = createClient();
    const { error } = await supabase.functions.invoke("campaign-outbound-call", {
      body: { action: "pause", campaign_id: campaignId },
    });
    if (error) toast.error("Erreur"); else { toast.success("Campagne en pause"); fetchCampaign(); }
  }

  async function handleResume() {
    setLaunching(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.functions.invoke("campaign-outbound-call", {
        body: { action: "resume", campaign_id: campaignId },
      });
      if (error) throw error;
      toast.success("Campagne reprise !");
      fetchCampaign();
    } catch {
      toast.error("Erreur lors de la reprise");
    } finally {
      setLaunching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-center py-12 text-slate-500">Campagne introuvable</div>;
  }

  const s = campaignStatusMap[campaign.status] || campaignStatusMap.draft;
  const progress = campaign.total_contacts > 0 ? Math.round((campaign.contacts_called / campaign.total_contacts) * 100) : 0;
  const filteredAvailable = availableContacts.filter((c) => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => router.push("/campagnes")} className="btn-ghost flex items-center gap-1">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 m-0">{campaign.name}</h1>
            <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
          </div>
          {campaign.description && <p className="text-sm text-slate-500 mt-1 m-0">{campaign.description}</p>}
          {campaign.agent && <p className="text-xs text-slate-400 mt-1 m-0">Agent : {(campaign.agent as { name: string }).name}</p>}
        </div>
        <div className="flex gap-2">
          {(campaign.status === "draft" || campaign.status === "paused") && (
            <button onClick={campaign.status === "paused" ? handleResume : handleLaunch} disabled={launching} className="btn-primary flex items-center gap-1">
              {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {campaign.status === "paused" ? "Reprendre" : "Lancer"}
            </button>
          )}
          {campaign.status === "running" && (
            <button onClick={handlePause} className="btn-secondary flex items-center gap-1">
              <Pause size={14} /> Pause
            </button>
          )}
          <button onClick={openAddModal} className="btn-secondary flex items-center gap-1">
            <UserPlus size={14} /> Ajouter contacts
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 mb-6">
        {[
          { icon: Users, label: "Total", value: campaign.total_contacts, color: "#6b7280" },
          { icon: Phone, label: "Appeles", value: campaign.contacts_called, color: "#2563EB" },
          { icon: CheckCircle, label: "Repondus", value: campaign.contacts_answered, color: "#059669" },
          { icon: XCircle, label: "Echoues", value: campaign.contacts_failed, color: "#DC2626" },
          { icon: Clock, label: "Duree totale", value: formatDuration(contacts.reduce((sum, c) => sum + (c.call_duration_seconds || 0), 0) || null), color: "#7C3AED" },
          { icon: DollarSign, label: "Cout", value: `${campaign.cost_euros?.toFixed(2) || "0.00"} EUR`, color: "#0f172a" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <Icon size={20} className="mx-auto mb-2" style={{ color }} />
            <div className="text-xl font-bold text-slate-900">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card p-4 mb-6">
        <div className="flex justify-between text-[0.8125rem] mb-2">
          <span className="text-slate-500">Progression</span>
          <span className="font-semibold text-slate-900">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Contacts table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-bold m-0 text-slate-900">
            Contacts ({contacts.length})
          </h2>
        </div>
        {contacts.length === 0 ? (
          <div className="text-center py-12 px-4 text-slate-400">
            <Users size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="font-medium">Aucun contact</p>
            <p className="text-[0.8125rem]">Ajoutez des contacts pour commencer la campagne</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Telephone</th>
                  <th>Statut</th>
                  <th>Duree</th>
                  <th>Appele a</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((cc) => {
                  const st = contactStatusMap[cc.status] || contactStatusMap.pending;
                  const ct = cc.contact;
                  return (
                    <tr key={cc.id}>
                      <td>
                        <span className="font-medium text-slate-900">
                          {ct ? `${ct.first_name} ${ct.last_name}` : "—"}
                        </span>
                        {ct?.company && <span className="text-xs text-slate-400 ml-2">{ct.company}</span>}
                      </td>
                      <td className="text-sm text-slate-700">{ct?.phone || "—"}</td>
                      <td>
                        <span className="badge inline-flex items-center gap-1" style={{ backgroundColor: st.bg, color: st.color }}>
                          {cc.status === "calling" && <Loader2 size={12} className="animate-spin" />}
                          {st.label}
                        </span>
                      </td>
                      <td className="text-sm text-slate-500">{formatDuration(cc.call_duration_seconds)}</td>
                      <td className="text-sm text-slate-500">
                        {cc.called_at ? new Date(cc.called_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Launch confirmation modal */}
      <AnimatePresence>
        {showLaunchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLaunchModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                  <Play size={18} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-bold m-0 text-slate-900">Lancer la campagne</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">
                <strong>{contacts.filter((c) => c.status === "pending").length} contact(s)</strong> seront appele(s). Cette action lancera les appels immediatement.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowLaunchModal(false)} className="btn-secondary">Annuler</button>
                <button onClick={confirmLaunch} className="btn-primary flex items-center gap-1">
                  <Play size={14} /> Lancer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add contacts modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold m-0">Ajouter des contacts</h2>
                <button onClick={() => setShowAddModal(false)} className="btn-ghost p-1"><X size={18} /></button>
              </div>
              <div className="mb-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input-field pl-9"
                    placeholder="Rechercher par nom, telephone..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 rounded-lg">
                {filteredAvailable.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    Aucun contact disponible
                  </div>
                ) : (
                  filteredAvailable.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-slate-50 transition-colors ${selectedIds.has(c.id) ? "bg-slate-50" : "hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                          setSelectedIds(next);
                        }}
                        className="accent-slate-900"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 text-sm">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-slate-500">{c.phone} {c.company ? `· ${c.company}` : ""}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[0.8125rem] text-slate-500">{selectedIds.size} selectionne(s)</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddModal(false)} className="btn-secondary">Annuler</button>
                  <button onClick={handleAddContacts} disabled={addingContacts || selectedIds.size === 0} className="btn-primary">
                    {addingContacts ? "Ajout..." : "Ajouter"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
