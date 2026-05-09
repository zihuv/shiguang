export const SHIGUANG_SERVER_URL = "http://127.0.0.1:7845";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "未知错误");
  if (message === "Failed to fetch") {
    return "无法连接到拾光本地服务（127.0.0.1:7845），请确保拾光应用正在运行";
  }
  return message;
}

export async function isShiguangServerReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${SHIGUANG_SERVER_URL}/api/health`, {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchShiguang(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${SHIGUANG_SERVER_URL}${endpoint}`;
  try {
    return await fetch(url, options);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error || "网络错误");
    const reachable = await isShiguangServerReachable();
    if (!reachable) {
      throw new Error(
        `无法连接到拾光本地服务（${SHIGUANG_SERVER_URL}）。请确认拾光应用正在运行，且浏览器扩展允许访问 127.0.0.1。原始错误：${rawMessage}`,
      );
    }

    throw new Error(
      `拾光本地服务可连接，但请求 ${endpoint} 失败。可能被浏览器、代理或安全软件拦截。原始错误：${rawMessage}`,
    );
  }
}

function parseServerErrorText(errorText: string): string {
  if (!errorText) {
    return "";
  }

  try {
    const payloadRecord = asRecord(JSON.parse(errorText));
    if (typeof payloadRecord.message === "string" && payloadRecord.message) {
      return payloadRecord.message;
    }
    if (typeof payloadRecord.error === "string" && payloadRecord.error) {
      return payloadRecord.error;
    }
  } catch {
    // Keep plain text errors as-is.
  }

  return errorText;
}

export async function readShiguangJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    const errorText = await response.text();
    const message =
      parseServerErrorText(errorText) ||
      `拾光本地服务返回 HTTP ${response.status} ${response.statusText || ""}`.trim();
    throw new Error(message);
  }

  const result = asRecord(await response.json());
  if (!result.success) {
    throw new Error(typeof result.error === "string" ? result.error : "Unknown error");
  }

  return result;
}

export async function fetchFoldersFromShiguang(): Promise<Record<string, unknown>> {
  const response = await fetchShiguang("/api/folders");
  return readShiguangJson(response);
}
