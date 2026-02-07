"use client";

import { useState, useEffect } from "react";
import { MessageSquare, CheckCircle, XCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatPhone } from "@/lib/utils";
import type { SmsHistoryEntry } from "@/types/database";

export default function SmsHistoriquePage() {
  const [messages, setMessages] = useState<SmsHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from("sms_history")
        .select("*, contact:contacts(first_name, last_name)")
        .order("sent_at", { ascending: false })
        .limit(100);
      setMessages((data as SmsHistoryEntry[]) || []);
      setLoading(false);
    }
    fetch();
  }, []);

  const statusMap: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    pending: { icon: <Clock size={14} />, color: "#D97706", label: "En attente" },
    sent: { icon: <CheckCircle size={14} />, color: "#2563EB", label: "Envoye" },
    delivered: { icon: <CheckCircle size={14} />, color: "#059669", label: "Livre" },
    failed: { icon: <XCircle size={14} />, color: "#DC2626", label: "Echoue" },
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "5rem 0" }}>
        <div style={{ width: "2rem", height: "2rem", border: "4px solid #FFEDD5", borderTopColor: "#F97316", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Historique SMS</h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>Consultez l&apos;historique des SMS envoyes</p>
      </div>

      {messages.length === 0 ? (
        <div className="empty-state">
          <MessageSquare className="empty-state-icon" />
          <p className="empty-state-title">Aucun SMS envoye</p>
          <p className="empty-state-desc">L&apos;historique de vos envois apparaitra ici</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Destinataire</th>
                <th>Contenu</th>
                <th>Statut</th>
                <th>Envoye le</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => {
                const s = statusMap[msg.status] || statusMap.pending;
                const contact = msg.contact as unknown as { first_name: string; last_name: string } | null;
                return (
                  <tr key={msg.id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 500, color: "#111827" }}>
                          {contact ? `${contact.first_name} ${contact.last_name}` : formatPhone(msg.phone_to)}
                        </div>
                        {contact && <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{formatPhone(msg.phone_to)}</div>}
                      </div>
                    </td>
                    <td>
                      <p style={{ margin: 0, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {msg.content}
                      </p>
                    </td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: s.color, fontSize: "0.8125rem" }}>
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{formatDateTime(msg.sent_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
