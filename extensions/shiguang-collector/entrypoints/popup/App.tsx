import { useEffect, useState } from "react";

type ConnectionState = "checking" | "connected" | "disconnected";

function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      try {
        const response = await sendRuntimeMessage<{ connected?: boolean }>({
          action: "checkConnection",
        });
        if (!cancelled) {
          setConnectionState(response?.connected ? "connected" : "disconnected");
        }
      } catch {
        if (!cancelled) {
          setConnectionState("disconnected");
        }
      }
    }

    void checkConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const connected = connectionState === "connected";
  const text = connectionState === "checking" ? "检查中..." : connected ? "已连接" : "未连接";

  return (
    <main className="container">
      <header className="header">
        <h1>拾光采集器</h1>
      </header>

      <section className="status-section" aria-label="连接状态">
        <div className="status-label">连接状态</div>
        <div className="status-indicator">
          <span className={`status-dot ${connected ? "connected" : "disconnected"}`} />
          <span className="status-text">{text}</span>
        </div>
      </section>
    </main>
  );
}
