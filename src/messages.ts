export interface OnlineAdmin {
  userId: string;
  username: string;
  lastSeen: string;
}

export interface ChatMessage {
  id: number;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Presence
export async function fetchOnlineAdmins(): Promise<OnlineAdmin[]> {
  return apiFetch<OnlineAdmin[]>("/api/presence");
}

export async function sendPresenceHeartbeat(): Promise<void> {
  await apiFetch("/api/presence", { method: "POST" });
}

// Messages
export async function fetchMessages(orderId: number): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/api/messages?orderId=${orderId}`);
}

export async function sendMessage(orderId: number, content: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, content }),
  });
}

export async function deleteMessages(orderId: number): Promise<void> {
  await apiFetch(`/api/messages?orderId=${orderId}`, { method: "DELETE" });
}
