import { VoiceDemo } from "../components/VoiceDemo";

export function ManualExamplePage() {
  return (
    <VoiceDemo
      title="Manual Push-to-Talk"
      description="Start and stop the microphone explicitly. Perfect for guided command flows or when you want to keep latency predictable."
      highlight="Client sends start/end"
    />
  );
}
