"use client"

import { useRef } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"

import { deletePayment } from "@/app/(dashboard)/dashboard/payments/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function PaymentRowActions({ paymentId }: { paymentId: string }) {
  const formRef = useRef<HTMLFormElement>(null)

  function handleDelete() {
    const ok = window.confirm("Delete this payment? This cannot be undone.")
    if (!ok) return
    formRef.current?.requestSubmit()
  }

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Open payment actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
            <Trash2 />
            Delete payment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <form ref={formRef} action={deletePayment} className="hidden">
        <input type="hidden" name="paymentId" value={paymentId} />
      </form>
    </div>
  )
}
