import { AppLayout } from "@/components/app-layout";

export default function POSPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">POS (Point of Sale)</h1>
        <p className="text-sm text-gray-600">
          This section will eventually be your point-of-sale hub for pro shop
          items, drop-ins, and add-on sales.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          We&apos;ll decide later if this connects to Stripe, Square, or
          another payment provider and how deeply you want it integrated.
        </div>
      </div>
    </AppLayout>
  );
}
