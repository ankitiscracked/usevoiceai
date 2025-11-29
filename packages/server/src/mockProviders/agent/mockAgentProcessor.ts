import type { AgentProcessor } from "../../types";

export interface MockAgentProcessorOptions {
  responsePrefix?: string;
}

export class MockAgentProcessor implements AgentProcessor {
  constructor(private options: MockAgentProcessorOptions = {}) {}

  async process({
    transcript
  }: Parameters<AgentProcessor["process"]>[0]) {
    const prefix = this.options.responsePrefix ?? "Agent response:";
    return `${prefix} ${transcript}`;
  }
}
