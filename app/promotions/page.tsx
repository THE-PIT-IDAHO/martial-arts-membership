import { AppLayout } from "@/components/app-layout";

export default function PromotionsPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Promotions</h1>
        <p className="text-sm text-gray-600">
          Track trials, bring-a-friend promos, seasonal offers, and marketing
          campaigns here.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Later we can connect this with Communication so you can send promo
          messages directly from the software.
        </div>
      </div>
    </AppLayout>
  );
}
