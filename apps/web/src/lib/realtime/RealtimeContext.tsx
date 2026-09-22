"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/room/api";
import { useAuth } from "@/lib/auth/AuthContext";

const VISITOR_KEY = "livepresentation:visitorId";

// A random id per browser: counts a guest once across tabs in "who's online",
// and ties a guest's support chat to them. Kept only in this browser.
function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

interface RealtimeValue {
  // The /app socket (presence + support chat); null until connected once.
  socket: Socket | null;
  // Staff only: unread support messages across the conversations they see.
  staffUnread: number;
}

const RealtimeContext = createContext<RealtimeValue>({ socket: null, staffUnread: 0 });

// One app-wide connection per tab, re-made when the signed-in user changes so
// the server always knows who it is.
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const pathname = usePathname();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [staffUnread, setStaffUnread] = useState(0);

  useEffect(() => {
    if (loading) return;
    const s = io(`${API_URL}/app`, {
      transports: ["websocket", "polling"],
      auth: { token: token ?? undefined, visitorId: visitorId(), path: window.location.pathname },
    });
    s.on("support:badge", ({ unread }: { unread: number }) => setStaffUnread(unread));
    // Shared once it's connected; consumers can emit straight away.
    s.on("connect", () => setSocket(s));
    return () => {
      s.disconnect();
      setSocket(null);
      setStaffUnread(0);
    };
  }, [token, loading]);

  useEffect(() => {
    socket?.emit("presence:path", { path: pathname });
  }, [socket, pathname]);

  return <RealtimeContext.Provider value={{ socket, staffUnread }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
