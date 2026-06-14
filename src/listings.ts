export interface Listing {
  id: number;
  sellerId: string;
  sellerName: string;
  chestX: number;
  chestY: number;
  chestZ: number;
  slot: number;
  itemName: string;
  itemId: string;
  itemComponents: string;
  tooltipLines: string[];
  count: number;
  price: number;
  listingType: "single" | "bulk";
  status: string;
  createdAt: string;
}

export interface CreateListingInput {
  chestPos: { x: number; y: number; z: number };
  slot: number;
  itemName: string;
  itemId: string;
  itemComponents?: string;
  tooltipLines?: string[];
  count: number;
  price: number;
  listingType: "single" | "bulk";
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchListings(chestPos: { x: number; y: number; z: number }): Promise<Listing[]> {
  const params = new URLSearchParams({
    chest_x: String(chestPos.x),
    chest_y: String(chestPos.y),
    chest_z: String(chestPos.z),
  });
  return apiFetch<Listing[]>(`/api/listings?${params}`);
}

/** Fetch all active listings across all chests (for card coloring on page load) */
export async function fetchAllActiveListings(): Promise<Listing[]> {
  return apiFetch<Listing[]>("/api/listings");
}

/** Derive chest pos → listing type map from a list of active listings */
export function buildListingTypeMap(listings: Listing[]): Record<string, "bulk" | "single"> {
  const map: Record<string, "bulk" | "single"> = {};
  for (const l of listings) {
    const key = `(${l.chestX}, ${l.chestY}, ${l.chestZ})`;
    if (l.slot === -1) {
      map[key] = "bulk";
    } else if (!(key in map)) {
      map[key] = "single";
    }
    // bulk takes priority — don't overwrite
  }
  return map;
}

export async function createListing(data: CreateListingInput): Promise<Listing> {
  return apiFetch<Listing>("/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function cancelListing(id: number): Promise<void> {
  await apiFetch(`/api/listings/${id}`, { method: "DELETE" });
}

export async function checkListingRole(): Promise<boolean> {
  try {
    const data = await apiFetch<{ hasRole: boolean }>("/api/listings/check-role");
    return data.hasRole;
  } catch {
    return false;
  }
}
