import { useCallback, useEffect, useState } from 'react'
import { Unlink } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { isOrderType } from '@/auth/auth-context'
import { orderNoun } from '@/business/activeType'
import { ConfirmModal } from '@/components/ui'
import { money } from '@/leads/labels'
import { useTenant } from '@/tenant/useTenant'
import { BookingDrawer } from '@/bookings/BookingDrawer'
import type { BookingRefs } from '@/bookings/useBookingRefs'
import type { BookingRow } from '@/bookings/types'
import { AddOrdersDrawer } from './AddOrdersDrawer'
import { getInvoice, removeInvoiceOrder } from './api'
import { InvoiceDrawer, bookingRef } from './InvoiceDrawer'
import { isFullyPaid, type InvoiceRow } from './types'

/**
 * An invoice in a side panel: its status and totals, type and company, Bill to, its bookings / orders (open, remove,
 * add), the GST rate, the payment parts (record payments) and Print.
 */
export function InvoicePanel({ invoiceId, refs, onClose, onChanged }: { invoiceId: string; refs: BookingRefs; onClose: () => void; onChanged?: (msg: string) => void }) {
  const tenant = useTenant()
  const { businesses } = useAuth()
  const [inv, setInv] = useState<InvoiceRow | null | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const [order, setOrder] = useState<BookingRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<BookingRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // the form is rebuilt (key) only after a change here, not on the first load — that remount made it open twice
  const load = useCallback((bump = false) => {
    getInvoice(invoiceId).then(
      (i) => {
        setInv(i)
        if (bump) setVersion((v) => v + 1)
      },
      (e: Error) => {
        setError(e.message)
        setInv(null)
      },
    )
  }, [invoiceId])
  useEffect(() => load(), [load])
  // not found / not allowed: nothing to show
  useEffect(() => {
    if (inv === null) onClose()
  }, [inv, onClose])
  const changed = (msg: string) => {
    onChanged?.(msg)
    load(true)
  }

  if (!inv) return null
  const biz = businesses.find((b) => b.id === inv.business_id)
  const type = biz ? (biz.subs.find((s) => s.id === inv.sub_business_id)?.type ?? biz.type) : null
  const orders = isOrderType(type)
  const noun = orders ? orderNoun(type) : { one: 'Booking', many: 'Bookings' }

  async function remove() {
    if (!removing) return
    setBusy(true)
    try {
      await removeInvoiceOrder(removing.id)
      changed(`${bookingRef(removing)} removed from ${inv!.invoice_no}.`)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
    setRemoving(null)
  }

  return (
    <>
      <InvoiceDrawer
        key={version}
        invoice={inv}
        refs={refs}
        noun={noun.one}
        onViewBooking={setOrder}
        onRemoveBooking={setRemoving}
        onAddBooking={() => setAdding(true)}
        outerError={error}
        onClose={onClose}
        onSaved={(msg) => {
          onChanged?.(msg)
          onClose()
        }}
      />
      {adding && (
        <AddOrdersDrawer
          tenantId={tenant.id}
          inv={inv}
          noun={noun}
          onClose={() => setAdding(false)}
          onSaved={(msg) => {
            setAdding(false)
            changed(msg)
          }}
        />
      )}
      {order && (
        <BookingDrawer
          key={order.id}
          booking={order}
          service={orders}
          noun={noun.one}
          lead={{ id: order.lead_id, customer_id: order.customer_id, name: order.client_name, phone: order.phone ?? '', purpose: null, business_id: order.business_id, sub_business_id: order.sub_business_id }}
          refs={refs}
          locked={isFullyPaid(inv)}
          onClose={() => setOrder(null)}
          onSaved={(msg) => {
            setOrder(null)
            changed(msg)
          }}
        />
      )}
      <ConfirmModal
        open={!!removing}
        icon={Unlink}
        danger
        title={`Remove ${removing ? bookingRef(removing) : ''} from this invoice?`}
        message={`The ${noun.one.toLowerCase()} stays, but goes back to “not invoiced” and the invoice total drops by ${money(removing?.total_amount ?? 0)}. The last unpaid part is lowered to match.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
