import {
  VoiceInputController,
  VoiceInputResult,
  VoiceInputStore,
  VoiceSocketClient,
  type VoiceSocketEvent,
  type VoiceSocketClientOptions,
} from "@usevoiceai/core";

interface VoiceCommandBridgeOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  state?: VoiceInputStore;
  mediaDevices?: MediaDevices;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  onCustomEvent?: (event: VoiceSocketEvent) => void;
}

interface VoiceCommandBridge {
  store: VoiceInputStore;
  controller: VoiceInputController;
  socket: VoiceSocketClient;
  getQueryResponse(): VoiceInputResult | null;
  subscribeQueryResponse(
    handler: (result: VoiceInputResult | null) => void
  ): () => void;
  destroy(): void;
}

export function createVoiceCommandBridge(
  options: VoiceCommandBridgeOptions = {}
): VoiceCommandBridge {
  const store = options.state ?? new VoiceInputStore();
  const socket =
    options.socket ??
    new VoiceSocketClient({ ...(options.socketOptions ?? {}) });

  const controller = new VoiceInputController({
    socket,
    store,
    notifications: options.notifications,
    mediaDevices: options.mediaDevices,
    onCustomEvent: options.onCustomEvent,
  });

  return {
    store,
    controller,
    socket,
    getQueryResponse: () => null,
    subscribeQueryResponse() {
      return () => {};
    },
    destroy() {
      controller.destroy();
      if (!options.socket) {
        socket.close();
      }
    },
  };
}
