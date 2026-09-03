import { redirect } from "next/navigation";

import { ContactsPanel } from "@/features/contacts/components/contacts-panel";
import { createClient } from "@/lib/supabase/server-client";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <ContactsPanel userId={data.user.id} />;
}
