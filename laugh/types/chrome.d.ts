// Minimal ambient declarations for the Chrome extension APIs Laugh actually uses.
// Hand-written on purpose: pulling in @types/chrome would add a dependency for a
// surface this small.

declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    const id: string;

    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
    function sendMessage<Response = unknown>(message: unknown): Promise<Response>;

    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      url?: string;
    }

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
  }

  namespace storage {
    interface StorageArea {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    }

    const local: StorageArea;

    const onChanged: {
      addListener(
        callback: (
          changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
          areaName: string,
        ) => void,
      ): void;
    };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active?: boolean;
      windowId?: number;
    }

    function query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string | string[] }): Promise<Tab[]>;
    function sendMessage<Response = unknown>(tabId: number, message: unknown): Promise<Response>;
    function create(properties: { url: string; active?: boolean }): Promise<Tab>;
  }

  namespace commands {
    const onCommand: {
      addListener(callback: (command: string, tab?: tabs.Tab) => void): void;
    };
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
  }
}
