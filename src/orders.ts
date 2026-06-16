export interface OrderItem {
  listingId: number;
  itemName: string;
  itemId: string;
  count: number;
  price: number;
  listingType?: "single" | "bulk";
  itemComponents?: string;
  // Listing snapshot (captured at order creation for inspection)
  chestX?: number;
  chestY?: number;
  chestZ?: number;
  slot?: number;
  listingCount?: number;
}

export interface Order {
  id: number;
  buyerId: string;
  buyerName: string;
  items: OrderItem[];
  totalPrice: number;
  status: "pending" | "processing" | "completed" | "cancelled";
  assignedAdminId: string | null;
  minecraftId: string | null;
  inspected: boolean;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchMyOrders(): Promise<Order[]> {
  return apiFetch<Order[]>("/api/orders?mine=true");
}

export async function fetchOrders(status?: string): Promise<Order[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<Order[]>(`/api/orders${params}`);
}

export async function createOrder(items: OrderItem[], minecraftId: string, assignedAdminId?: string): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, minecraftId, assignedAdminId }),
  });
}

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  await apiFetch(`/api/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function markOrderInspected(id: number, inspected: boolean): Promise<void> {
  await apiFetch(`/api/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inspected }),
  });
}
