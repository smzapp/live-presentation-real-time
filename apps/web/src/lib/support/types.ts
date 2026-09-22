export type SupportSender = "customer" | "staff" | "system";

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderType: SupportSender;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface SupportConversation {
  id: string;
  userId: string | null;
  guestKey: string | null;
  customerName: string;
  customerEmail: string | null;
  status: "open" | "closed";
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  unreadForStaff: number;
  unreadForCustomer: number;
  lastMessageAt: string;
  createdAt: string;
  // The latest message, for list previews.
  messages: { body: string; senderType: SupportSender; createdAt: string }[];
}

export interface SupportResult {
  conversation: SupportConversation | null;
  messages: SupportMessage[];
}

export interface StaffMember {
  id: string;
  name: string;
  role: "superadmin" | "support";
}

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };
