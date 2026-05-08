import { defineExtensionMessaging } from "@webext-core/messaging";

interface CollectorProtocol {
  checkConnection(): { connected: boolean };
}

export const { onMessage, sendMessage } = defineExtensionMessaging<CollectorProtocol>();
