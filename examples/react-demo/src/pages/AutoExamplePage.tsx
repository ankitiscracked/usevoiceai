import { VoiceDemo } from "../components/VoiceDemo";

export function AutoExamplePage() {
  return (
    <VoiceDemo
      title="Hands-free Auto Detection"
      description="Deepgram’s speech-end and speech-start hints take over. The mic auto-stops when silence is detected and re-arms after TTS playback, so users can just keep talking."
      speechEndDetection={{ mode: "auto" }}
      highlight="Auto-stop & auto-restart"
    />
  );
}
