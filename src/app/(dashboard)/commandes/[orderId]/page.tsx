"use client";

import { useState, useEffect, use } from "react";
import { ArrowLeft, ShoppingCart, Phone, Mail, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import type { Order, OrderItem } from "@/types/database";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmee", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "En preparation", color: "bg-purple-100 text-purple-800" },
  ready: { label: "Prete", color: "bg-green-100 text-green-800" },
  delivered: { label: "Livree", color: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Annulee", color: "bg-red-100 text-red-800" },
};

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function fetchOrder() {
    setLoading(true);
    const supabase = createClient();

    const { data: orderData, error } = await supabase
      .from("orders")
      .select("*, contact:contacts(first_name, last_name, phone, email)")
      .eq("id", orderId)
      .single();

    if (error || !orderData) {
      toast.error("Commande introuvable");
      setLoading(false);
      return;
    }

    setOrder(orderData as Order);

    const { data: itemsData } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    setItems((itemsData as OrderItem[]) || []);
    setLoading(false);
  }

  async function handleStatusChange(newStatus: string) {
    if (!order) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    if (error) {
      toast.error("Erreur lors de la mise a jour");
    } else {
      toast.success("Statut mis a jour");
      setOrder({ ...order, status: newStatus as Order["status"] });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="spinner" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
        <p className="text-slate-500">Commande introuvable</p>
        <Link href="/commandes" className="btn-secondary mt-4 inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Retour aux commandes
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
  const orderDate = new Date(order.created_at).toLocaleDateString("fr-FR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/commandes" className="btn-ghost p-2">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900 m-0">Commande {order.order_number}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500 flex items-center gap-1">
              <Clock size={14} /> {orderDate}
            </span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>
        <select
          className="input-field w-auto"
          value={order.status}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Order items */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <ShoppingCart size={18} className="text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900 m-0">Articles commandes ({items.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Article</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Quantite</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Prix unitaire</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Sous-total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{item.item_name}</span>
                        {item.notes && <p className="text-xs text-slate-400 mt-0.5">{item.notes}</p>}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-slate-700">{item.quantity}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm text-slate-600">{item.unit_price.toFixed(2)} {order.currency}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-slate-900">{item.subtotal.toFixed(2)} {order.currency}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Sous-total</span>
                <span className="text-slate-700">{order.subtotal_amount.toFixed(2)} {order.currency}</span>
              </div>
              {order.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">TVA</span>
                  <span className="text-slate-700">{order.tax_amount.toFixed(2)} {order.currency}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold border-t border-slate-200 pt-2">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900">{order.total_amount.toFixed(2)} {order.currency}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="card mt-4">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <FileText size={18} className="text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900 m-0">Notes</h2>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-slate-600">{order.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Client info */}
        <div>
          <div className="card">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 m-0">Informations client</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase mb-1">Nom</p>
                <p className="text-sm font-medium text-slate-900">{order.client_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase mb-1">Telephone</p>
                <p className="text-sm text-slate-700 flex items-center gap-1.5">
                  <Phone size={14} className="text-slate-400" />
                  {order.client_phone}
                </p>
              </div>
              {order.client_email && (
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase mb-1">Email</p>
                  <p className="text-sm text-slate-700 flex items-center gap-1.5">
                    <Mail size={14} className="text-slate-400" />
                    {order.client_email}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick summary */}
          <div className="card mt-4">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 m-0">Resume</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Numero</span>
                <span className="font-mono text-slate-900">{order.order_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Articles</span>
                <span className="text-slate-900">{items.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Devise</span>
                <span className="text-slate-900">{order.currency}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-slate-200 pt-3">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900">{order.total_amount.toFixed(2)} {order.currency}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
