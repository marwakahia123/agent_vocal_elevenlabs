"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Search, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/utils";
import Link from "next/link";
import type { Order } from "@/types/database";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmee", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "En preparation", color: "bg-purple-100 text-purple-800" },
  ready: { label: "Prete", color: "bg-green-100 text-green-800" },
  delivered: { label: "Livree", color: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Annulee", color: "bg-red-100 text-red-800" },
};

export default function CommandesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), contact:contacts(first_name, last_name, phone, email)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erreur chargement des commandes");
    } else {
      setOrders((data as Order[]) || []);
    }
    setLoading(false);
  }

  async function handleStatusChange(orderId: string, newStatus: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) {
      toast.error("Erreur lors de la mise a jour");
    } else {
      toast.success("Statut mis a jour");
      fetchOrders();
    }
  }

  const filtered = orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.client_name.toLowerCase().includes(q) ||
        o.client_phone.includes(q)
      );
    }
    return true;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 m-0">Commandes</h1>
          <p className="text-sm text-slate-500 mt-1">
            Historique et gestion des commandes passees par vos agents
          </p>
        </div>
        <button onClick={fetchOrders} className="btn-secondary flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Total</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-slate-500">En attente</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold text-blue-600">{stats.confirmed}</div>
          <div className="text-xs text-slate-500">Confirmees</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold text-purple-600">{stats.preparing}</div>
          <div className="text-xs text-slate-500">En preparation</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field pl-9"
            placeholder="Rechercher par numero, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-sm">
            {search || filter !== "all" ? "Aucune commande trouvee avec ces filtres" : "Aucune commande pour le moment"}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Numero</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Telephone</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Articles</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Statut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
                  const itemCount = order.order_items?.length || 0;
                  return (
                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-semibold text-slate-900">{order.order_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-700">{order.client_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500">{order.client_phone}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-slate-600">{itemCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-slate-900">{order.total_amount.toFixed(2)} {order.currency}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${statusInfo.color}`}
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        >
                          {Object.entries(STATUS_LABELS).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-slate-400">{formatRelative(order.created_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link href={`/commandes/${order.id}`} className="btn-ghost p-1.5 inline-flex" title="Voir le detail">
                          <Eye size={16} className="text-slate-500" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
