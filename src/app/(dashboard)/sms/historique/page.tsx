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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("sms_history")
        .select("*, contact:contacts(first_name, last_name)")
        .eq("user_id", user.id)
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
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 m-0">Historique SMS</h1>
        <p className="text-sm text-slate-500 mt-1">Consultez l&apos;historique des SMS envoyes</p>
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
                        <div className="font-medium text-slate-900">
                          {contact ? `${contact.first_name} ${contact.last_name}` : formatPhone(msg.phone_to)}
                        </div>
                        {contact && <div className="text-xs text-slate-400">{formatPhone(msg.phone_to)}</div>}
                      </div>
                    </td>
                    <td>
                      <p className="m-0 max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {msg.content}
                      </p>
                    </td>
                    <td>
                      <span className="flex items-center gap-1 text-[0.8125rem]" style={{ color: s.color }}>
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td className="text-[0.8125rem] text-slate-500">{formatDateTime(msg.sent_at)}</td>
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
