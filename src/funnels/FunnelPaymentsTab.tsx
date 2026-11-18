import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CreditCard, Plus, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Drawer } from "@/components/Drawer";
import { ConfirmModal, Empty, Paged, SearchInput } from "@/components/ui";
import { db } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import { useTenant } from "@/tenant/useTenant";
import type { LeadRow } from "@/leads/types";

/**
 * Funnel → Payments: pick the Razorpay product names (the payment's description) this funnel sells and Save; lists those
 * payments whose phone (last 10 digits) or email matches one of this funnel's leads.
 */
type Pay = {
  id: string;
  payment_id: string;
  order_id: string | null;
  amount: number;
  status: string | null;
  method: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  paid_at: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  captured: { label: "Captured", cls: "badge-success" },
  authorized: { label: "Authorized", cls: "badge-info" },
  created: { label: "Created", cls: "badge-muted" },
  failed: { label: "Failed", cls: "badge-danger" },
  refunded: { label: "Refunded", cls: "badge-warning" },
};
const METHOD: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Netbanking",
  wallet: "Wallet",
  emi: "EMI",
  cardless_emi: "Cardless EMI",
  paylater: "Pay later",
  bank_transfer: "Bank transfer",
};
const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const last10 = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};
const mail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function FunnelPaymentsTab({
  funnelId,
  leads,
  canEdit,
}: {
  funnelId: string;
  leads: LeadRow[] | null;
  canEdit: boolean;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<string[] | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [rows, setRows] = useState<Pay[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    db()
      .from("funnels")
      .select("payment_descriptions")
      .eq("id", funnelId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        const v = ((data?.payment_descriptions ?? []) as string[]).filter(
          Boolean,
        );
        setSaved(v);
      });
  }, [funnelId]);

  // every Razorpay payment with a description (the product names to pick from, and the list)
  const load = useCallback(() => {
    setRows(null);
    db()
      .from("razorpay_payments")
      .select(
        "id, payment_id, order_id, amount, status, method, email, phone, description, paid_at",
      )
      .eq("tenant_id", tenant.id)
      .not("description", "is", null)
      .order("paid_at", { ascending: false })
      .limit(10000)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setRows((data ?? []) as Pay[]);
      });
  }, [tenant.id]);
  useEffect(load, [load]);

  // product names, most payments first (a saved one stays listed even with no payments now)
  const options = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of rows ?? []) {
      const d = (r.description ?? "").trim();
      if (d) n.set(d, (n.get(d) ?? 0) + 1);
    }
    for (const d of saved ?? []) if (!n.has(d)) n.set(d, 0);
    return [...n.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [rows, saved]);

  async function save(want: string[], msg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await db()
      .from("funnels")
      .update({ payment_descriptions: want })
      .eq("id", funnelId);
    setBusy(false);
    if (e) return setError(e.message);
    setSaved(want);
    setNotice(msg);
  }

  // this funnel's leads by phone (last 10 digits) and email
  const { byPhone, byEmail } = useMemo(() => {
    const byPhone = new Map<string, LeadRow>();
    const byEmail = new Map<string, LeadRow>();
    for (const l of leads ?? []) {
      const p = last10(l.phone);
      if (p && !byPhone.has(p)) byPhone.set(p, l);
      const m = mail(l.email);
      if (m && !byEmail.has(m)) byEmail.set(m, l);
    }
    return { byPhone, byEmail };
  }, [leads]);
  const matched = useMemo(
    () =>
      (rows ?? [])
        .filter((p) => (saved ?? []).includes((p.description ?? "").trim()))
        .map((p) => ({
          p,
          lead:
            byPhone.get(last10(p.phone)) ?? byEmail.get(mail(p.email)) ?? null,
        }))
        .filter((x): x is { p: Pay; lead: LeadRow } => !!x.lead),
    [rows, saved, byPhone, byEmail],
  );
  const per = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const { p } of matched) {
      const d = (p.description ?? "").trim();
      const x = m.get(d) ?? { n: 0, total: 0 };
      x.n++;
      if (p.status === "captured" || p.status === "refunded")
        x.total += Number(p.amount);
      m.set(d, x);
    }
    return m;
  }, [matched]);

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="muted small">
          Razorpay products (payment description) this funnel sells. Their
          payments from this funnel’s leads (matched by phone or email) count
          here.
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saved === undefined || !rows}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> Add more
          </button>
        )}
      </div>
      {saved === undefined || !rows || !leads ? (
        <div className="empty">Loading…</div>
      ) : !saved.length ? (
        <Empty icon={CreditCard}>
          No Razorpay products added to this funnel yet
          {canEdit ? ": press Add more." : "."}
        </Empty>
      ) : (
        <>
          <div className="card ad-tree">
            {saved.map((d) => (
              <div key={d} className="ad-tree-item">
                <div className="ad-tree-row">
                  <div className="ad-tree-main">
                    <b>{d}</b>
                    <span className="muted small">
                      {per.get(d)?.n ?? 0} payment
                      {per.get(d)?.n === 1 ? "" : "s"} from this funnel’s leads
                    </span>
                  </div>
                  <span className="num ad-tree-spend">
                    {per.get(d)?.total ? inr(per.get(d)!.total) : "—"}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      aria-label="Remove from this funnel"
                      title="Remove from this funnel"
                      disabled={busy}
                      onClick={() => setRemoving(d)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!matched.length ? (
            <Empty icon={CreditCard}>
              No payments yet for these products from this funnel’s leads
              (matched by phone or email).
            </Empty>
          ) : (
            <section className="panel">
              <Paged rows={matched} reset={[saved.join("|")]}>
                {(paged) => (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Paid on</th>
                          <th>Lead</th>
                          <th>Phone / email</th>
                          <th>Product</th>
                          <th className="num">Amount</th>
                          <th>Status</th>
                          <th>Method</th>
                          <th>Payment / order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(({ p, lead }) => {
                          const st = STATUS[p.status ?? ""] ?? {
                            label: p.status ?? "—",
                            cls: "badge-muted",
                          };
                          return (
                            <tr
                              key={p.id}
                              className={cn("is-clickable")}
                              onClick={() => navigate(`/leads/${lead.id}`)}
                              title="Open the lead"
                            >
                              <td className="nowrap">{when(p.paid_at)}</td>
                              <td>
                                <b>
                                  {[lead.first_name, lead.last_name]
                                    .filter(Boolean)
                                    .join(" ")}
                                </b>
                              </td>
                              <td className="small">
                                {p.phone && <div>{p.phone}</div>}
                                {p.email && (
                                  <div className="muted">{p.email}</div>
                                )}
                              </td>
                              <td className="small">{p.description}</td>
                              <td className="num nowrap">{inr(p.amount)}</td>
                              <td>
                                <span className={cn("badge", st.cls)}>
                                  {st.label}
                                </span>
                              </td>
                              <td className="nowrap">
                                {p.method
                                  ? (METHOD[p.method] ?? p.method)
                                  : "—"}
                              </td>
                              <td className="small nowrap">
                                <code>{p.payment_id}</code>
                                {p.order_id && (
                                  <div className="muted">
                                    <code>{p.order_id}</code>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Paged>
            </section>
          )}
        </>
      )}

      {adding && saved && rows && (
        <AddProducts
          options={options.filter(([d]) => !saved.includes(d))}
          busy={busy}
          onClose={() => setAdding(false)}
          onAdd={async (ds) => {
            await save(
              [...saved, ...ds],
              `${ds.length} product${ds.length === 1 ? "" : "s"} added to this funnel.`,
            );
            setAdding(false);
          }}
        />
      )}
      {removing && saved && (
        <ConfirmModal
          open
          title="Remove from this funnel?"
          message={`${removing} payments stop counting for this funnel. The payments stay in Payments → History logs, and you can add it again.`}
          confirmLabel="Remove"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const d = removing;
            setRemoving(null);
            await save(
              saved.filter((x) => x !== d),
              "Removed from this funnel.",
            );
          }}
        />
      )}
    </div>
  );
}

/** Add more: the Razorpay products (payment descriptions) not already in this funnel, ticked (several), then Add */
function AddProducts({
  options,
  busy,
  onClose,
  onAdd,
}: {
  options: [string, number][];
  busy: boolean;
  onClose: () => void;
  onAdd: (ds: string[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter(([d]) => !s || d.toLowerCase().includes(s));
  }, [options, q]);

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title="Add Razorpay products"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="foot-end">
            <Button
              onClick={() => void onAdd([...sel])}
              disabled={busy || !sel.size}
            >
              {busy ? "Adding…" : `Add${sel.size ? ` ${sel.size}` : ""}`}
            </Button>
          </div>
        </>
      }
    >
      <div className="stack">
        <SearchInput placeholder="Search products" value={q} onChange={setQ} />
        {!list.length ? (
          <div className="muted small">
            No more Razorpay products (payments with a description).
          </div>
        ) : (
          <div className="card ad-tree">
            {list.map(([d, n]) => (
              <label key={d} className="ad-tree-row">
                <input
                  type="checkbox"
                  checked={sel.has(d)}
                  onChange={() =>
                    setSel((p) => {
                      const x = new Set(p);
                      if (x.has(d)) x.delete(d);
                      else x.add(d);
                      return x;
                    })
                  }
                />
                <div className="ad-tree-main">
                  <b>{d}</b>
                  <span className="muted small">
                    {n} payment{n === 1 ? "" : "s"} in all
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
