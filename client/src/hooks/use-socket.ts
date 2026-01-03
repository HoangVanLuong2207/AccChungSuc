import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { Account, AccLog } from "@shared/schema";

interface AccountStatusUpdateEvent {
  entityType: "accounts" | "acclogs";
  accountIds: number[];
  status: boolean;
  timestamp: string;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Use API base URL from env (for Render backend) or current origin
    const socketUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    console.log("[Socket.IO] Initializing connection to:", socketUrl);

    // Create Socket.IO connection
    // For production (Render), use polling first then upgrade to websocket
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    const socket = io(socketUrl, {
      // Try polling first for better compatibility with reverse proxies (Render)
      transports: isProduction ? ["polling", "websocket"] : ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10, // More attempts for production
      reconnectionDelayMax: 5000,
      path: "/socket.io/",
      autoConnect: true,
      // For production with reverse proxy
      ...(isProduction && {
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: false,
      }),
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Socket.IO] ✅ Connected to server, socket ID:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] ❌ Disconnected from server, reason:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket.IO] ❌ Connection error:", error);
    });

    socket.on("reconnect", (attemptNumber) => {
      console.log("[Socket.IO] 🔄 Reconnected after", attemptNumber, "attempts");
    });

    socket.on("reconnect_attempt", (attemptNumber) => {
      console.log("[Socket.IO] 🔄 Reconnection attempt", attemptNumber);
    });

    socket.on("reconnect_error", (error) => {
      console.error("[Socket.IO] ❌ Reconnection error:", error);
    });

    socket.on("reconnect_failed", () => {
      console.error("[Socket.IO] ❌ Reconnection failed after all attempts");
    });

    // Listen for account status updates
    socket.on("account-status-updated", (data: AccountStatusUpdateEvent) => {
      console.log("[Socket.IO] ✅ Received account-status-updated event:", data);

      const { entityType, accountIds, status } = data;

      // Update React Query cache for the affected entity
      const listKey = entityType === "accounts" ? "/api/accounts" : "/api/acclogs";
      const statsKey = entityType === "accounts" ? "/api/accounts/stats" : "/api/acclogs/stats";

      console.log(`[Socket.IO] Updating cache for ${entityType}, accountIds:`, accountIds, "status:", status);

      // Update the accounts/acclogs list in cache
      queryClient.setQueryData<Account[] | AccLog[]>(listKey, (oldData) => {
        if (!oldData) {
          console.warn(`[Socket.IO] No cache data found for ${listKey}, invalidating to refetch`);
          queryClient.invalidateQueries({ queryKey: [listKey] });
          return oldData;
        }

        const updatedTimestamp = new Date(data.timestamp);
        const updated = oldData.map((item) => {
          if (accountIds.includes(item.id)) {
            console.log(`[Socket.IO] Updating account ${item.id} status from ${item.status} to ${status}`);
            return { ...item, status, updatedAt: updatedTimestamp };
          }
          return item;
        });

        console.log(`[Socket.IO] Cache updated successfully for ${listKey}`);
        return updated;
      });

      // Invalidate stats to refetch updated statistics
      queryClient.invalidateQueries({ queryKey: [statsKey] });
      console.log(`[Socket.IO] Invalidated stats query: ${statsKey}`);
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [queryClient]);

  return socketRef.current;
}

