import { createManualPayment } from "./actions"

import { PAYMENT_TYPE_OPTIONS, paymentTypeLabel } from "@/lib/payments/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default async function ManualPaymentsInputPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const { success, error } = await searchParams

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Input: Payments</h1>
        <p className="text-sm text-muted-foreground">
          Manual bank transfer entries. Currency is fixed to EUR.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Add payment</CardTitle>
          <CardDescription>Creates a succeeded payment record with source set to bank.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createManualPayment} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input id="customerName" name="customerName" required placeholder="Jane Smith" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                required
                placeholder="jane@company.com"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (EUR)</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="2500.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentDate">Payment date</Label>
                <Input id="paymentDate" name="paymentDate" type="date" required />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paymentType">Type</Label>
              <select
                id="paymentType"
                name="paymentType"
                required
                defaultValue={PAYMENT_TYPE_OPTIONS[0]}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {PAYMENT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {paymentTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit">Save payment</Button>
              <span className="text-xs text-muted-foreground">Source: bank · Currency: EUR</span>
            </div>
          </form>

          {success === "1" && (
            <p className="mt-4 text-sm text-green-600 dark:text-green-400">
              Payment saved successfully.
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-destructive">
              {error === "missing_fields" && "Please fill all fields correctly."}
              {error === "invalid_amount" && "Amount must be greater than 0."}
              {error === "invalid_date" && "Payment date is invalid."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
