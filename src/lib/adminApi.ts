export const ADMIN_UNAUTHORIZED_EVENT = "brenda-admin-unauthorized";

export class AdminApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "AdminApiError"; }
}

export async function adminRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/admin/${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      if (response.status === 401 && !["login", "session"].includes(path)) window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
      throw new AdminApiError(body.error || `The server returned HTTP ${response.status}.`, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(error instanceof Error && error.name === "AbortError" ? "Serveren svarede ikke i tide." : "Besøgsloggen kan ikke nås. Tjek at siden kører med den medfølgende server.", 0);
  } finally { window.clearTimeout(timeout); }
}

export async function downloadVisitorCsv(query: string) {
  const response = await fetch(`/api/admin/visits/export?${query}`, { credentials: "same-origin", cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } });
  if (response.status === 401) window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
  if (!response.ok) throw new AdminApiError("Eksporten fejlede. Prøv igen efter login.", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `brenda-visits-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
