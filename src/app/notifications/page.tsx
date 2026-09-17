import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications-view";

export const metadata: Metadata = {
  title: "Alerts",
};

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl tracking-tight text-teal-950">
          Alerts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          In-app feed for live price-change alerts. Push delivery comes later.
        </p>
      </div>
      <NotificationsView />
    </div>
  );
}
