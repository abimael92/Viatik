import { redirect } from "next/navigation";

import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { createClient } from "@/lib/supabase/server-client";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <NotificationCenter userId={data.user.id} />;
}
