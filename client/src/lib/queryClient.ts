import { QueryClient, QueryFunction } from "@tanstack/react-query";

// API base URL - set via environment variable for production (Render backend)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Try to parse the response as JSON to get a specific error message.
    try {
      const errorBody = await res.json();
      // Use the message from the JSON body if it exists.
      throw new Error(errorBody.message || `Request failed with status ${res.status}`);
    } catch (jsonError) {
      // If the body isn't JSON, or there's another error, throw a generic error.
      // This prevents the dreaded "Unexpected token '<'" error.
      throw new Error(`Request failed with status ${res.status}`);
    }
  }
}

export async function apiRequest<T>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const fullUrl = `${API_BASE_URL}${url}`;
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  // If the request was successful, we assume the response is valid JSON.
  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const url = `${API_BASE_URL}${queryKey.join("/")}`;
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
