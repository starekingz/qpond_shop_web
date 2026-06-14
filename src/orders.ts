export interface OrderItem {
  listingId: number;
  itemName: string;
  itemId: string;
  count: number;
  price: number;
}

export interface Order {
  id: number;
  buyerId: string;
  buyerName: string;
  items: OrderItem[];
  totalPrice: number;
  status: "pending" | "processing" | "completed" | "cancelled";
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

export async function fetchOrders(status?: string): Promise<Order[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<Order[]>(`/api/orders${params}`);
}

export async function createOrder(items: OrderItem[]): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  await apiFetch(`/api/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
