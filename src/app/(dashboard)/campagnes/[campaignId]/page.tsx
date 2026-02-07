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
    const existingIds = contacts.map((c) => c.contact_id);
    const { data } = await supabase
      .from("contacts")
      .select("*")
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

  async function handleLaunch() {
    if (!campaign?.agent_id) {
      toast.error("Associez un agent a cette campagne d'abord");
      return;
    }
    const pendingCount = contacts.filter((c) => c.status === "pending").length;
    if (pendingCount === 0) {
      toast.error("Aucun contact en attente a appeler");
      return;
    }
    if (!confirm(`Lancer la campagne ? ${pendingCount} contact(s) seront appele(s).`)) return;

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
      <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
        <div style={{ width: "2rem", height: "2rem", border: "4px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!campaign) {
    return <div style={{ textAlign: "center", padding: "3rem", color: "#6b7280" }}>Campagne introuvable</div>;
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
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button onClick={() => router.push("/campagnes")} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <ArrowLeft size={16} /> Retour
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>{campaign.name}</h1>
            <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
          </div>
          {campaign.description && <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>{campaign.description}</p>}
          {campaign.agent && <p style={{ color: "#9ca3af", fontSize: "0.8rem", margin: "0.25rem 0 0" }}>Agent : {(campaign.agent as { name: string }).name}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(campaign.status === "draft" || campaign.status === "paused") && (
            <button onClick={campaign.status === "paused" ? handleResume : handleLaunch} disabled={launching} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              {launching ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={14} />}
              {campaign.status === "paused" ? "Reprendre" : "Lancer"}
            </button>
          )}
          {campaign.status === "running" && (
            <button onClick={handlePause} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Pause size={14} /> Pause
            </button>
          )}
          <button onClick={openAddModal} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <UserPlus size={14} /> Ajouter contacts
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { icon: Users, label: "Total", value: campaign.total_contacts, color: "#6b7280" },
          { icon: Phone, label: "Appeles", value: campaign.contacts_called, color: "#2563EB" },
          { icon: CheckCircle, label: "Repondus", value: campaign.contacts_answered, color: "#059669" },
          { icon: XCircle, label: "Echoues", value: campaign.contacts_failed, color: "#DC2626" },
          { icon: Clock, label: "Duree totale", value: formatDuration(contacts.reduce((sum, c) => sum + (c.call_duration_seconds || 0), 0) || null), color: "#7C3AED" },
          { icon: DollarSign, label: "Cout", value: `${campaign.cost_euros.toFixed(2)} EUR`, color: "#F97316" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card" style={{ padding: "1rem", textAlign: "center" }}>
            <Icon size={20} style={{ color, margin: "0 auto 0.5rem" }} />
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>{value}</div>
            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
          <span style={{ color: "#6b7280" }}>Progression</span>
          <span style={{ fontWeight: 600, color: "#111827" }}>{progress}%</span>
        </div>
        <div style={{ height: "8px", backgroundColor: "#f3f4f6", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, backgroundColor: "#F97316", borderRadius: "4px", transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* Contacts table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "1rem", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "#111827" }}>
            Contacts ({contacts.length})
          </h2>
        </div>
        {contacts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#9ca3af" }}>
            <Users size={36} style={{ margin: "0 auto 0.5rem", color: "#d1d5db" }} />
            <p style={{ fontWeight: 500 }}>Aucun contact</p>
            <p style={{ fontSize: "0.8125rem" }}>Ajoutez des contacts pour commencer la campagne</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Contact</th>
                  <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Telephone</th>
                  <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Statut</th>
                  <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Duree</th>
                  <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Appele a</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((cc) => {
                  const st = contactStatusMap[cc.status] || contactStatusMap.pending;
                  const ct = cc.contact;
                  return (
                    <tr key={cc.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 500, color: "#111827" }}>
                        {ct ? `${ct.first_name} ${ct.last_name}` : "—"}
                        {ct?.company && <span style={{ fontSize: "0.75rem", color: "#9ca3af", marginLeft: "0.5rem" }}>{ct.company}</span>}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#374151", fontSize: "0.875rem" }}>{ct?.phone || "—"}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span className="badge" style={{ backgroundColor: st.bg, color: st.color, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                          {cc.status === "calling" && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#6b7280", fontSize: "0.875rem" }}>{formatDuration(cc.call_duration_seconds)}</td>
                      <td style={{ padding: "0.75rem 1rem", color: "#6b7280", fontSize: "0.875rem" }}>
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

      {/* Add contacts modal */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowAddModal(false)} />
          <div style={{ position: "relative", backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem", width: "100%", maxWidth: "32rem", margin: "0 1rem", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>Ajouter des contacts</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost" style={{ padding: "0.25rem" }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: "2.25rem" }}
                  placeholder="Rechercher par nom, telephone..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
              {filteredAvailable.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: "0.875rem" }}>
                  Aucun contact disponible
                </div>
              ) : (
                filteredAvailable.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      cursor: "pointer",
                      borderBottom: "1px solid #f3f4f6",
                      backgroundColor: selectedIds.has(c.id) ? "#FFF7ED" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        setSelectedIds(next);
                      }}
                      style={{ accentColor: "#F97316" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: "#111827", fontSize: "0.875rem" }}>{c.first_name} {c.last_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{c.phone} {c.company ? `· ${c.company}` : ""}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{selectedIds.size} selectionne(s)</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => setShowAddModal(false)} className="btn-secondary">Annuler</button>
                <button onClick={handleAddContacts} disabled={addingContacts || selectedIds.size === 0} className="btn-primary">
                  {addingContacts ? "Ajout..." : "Ajouter"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
