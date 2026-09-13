import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

export function createRoomSocket(): Socket {
  return io(API_URL, {
    autoConnect: false,
    transports: ["websocket", "polling"],
  });
}
