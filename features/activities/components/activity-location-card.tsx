import { Map } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ActivityLocationCard({
  name,
  formattedAddress,
  placeId,
}: {
  name: string;
  formattedAddress: string;
  placeId: string;
}) {
  const params = new URLSearchParams({
    api: "1",
    query: name,
    query_place_id: placeId,
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{formattedAddress}</p>
      </div>
      <Button asChild variant="primary">
        <a
          href={`https://www.google.com/maps/search/?${params.toString()}`}
          target="_blank"
          rel="noreferrer"
        >
          <Map aria-hidden />
          Open in Maps
        </a>
      </Button>
    </div>
  );
}
