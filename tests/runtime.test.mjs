import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeCopilotClient } from "./fake-copilot-fixture.mjs";
import { buildPersistentTaskSessionId, parseStructuredOutput } from "../plugins/copilot/scripts/lib/copilot-client.mjs";

describe("runtime: buildPersistentTaskSessionId", () => {
  it("returns session ID with task prefix", () => {
    const id = buildPersistentTaskSessionId("Fix the authentication bug");
    assert.ok(id.startsWith("Copilot Companion Task"));
    assert.ok(id.includes("Fix the authentication bug"));
  });

  it("handles empty prompt", () => {
    const id = buildPersistentTaskSessionId("");
    assert.equal(id, "Copilot Companion Task");
  });

  it("shortens long prompts", () => {
    const longPrompt = "A".repeat(100);
    const id = buildPersistentTaskSessionId(longPrompt);
    assert.ok(id.length < 100);
  });
});

describe("runtime: parseStructuredOutput", () => {
  it("parses valid JSON", () => {
    const result = parseStructuredOutput('{"verdict":"pass","summary":"All good"}');
    assert.equal(result.parsed.verdict, "pass");
    assert.equal(result.parseError, null);
  });

  it("handles invalid JSON", () => {
    const result = parseStructuredOutput("not json");
    assert.equal(result.parsed, null);
    assert.ok(result.parseError);
  });

  it("handles empty output", () => {
    const result = parseStructuredOutput("");
    assert.equal(result.parsed, null);
    assert.ok(result.parseError);
  });
});

describe("runtime: FakeCopilotClient end-to-end flow", () => {
  it("full task flow: start -> session -> prompt -> response", async () => {
    const client = new FakeCopilotClient();
    client.setSessionConfig({
      _cannedResponse: { data: { content: "Task completed successfully." } }
    });

    await client.start();
    const session = await client.createSession({
      model: "gpt-5.4",
      sessionId: "task-session-1"
    });

    const response = await session.sendAndWait({ prompt: "Fix the bug" });
    assert.equal(response.data.content, "Task completed successfully.");

    await client.stop();
    assert.equal(client.stopped, true);
  });

  it("full review flow with streaming events", async () => {
    const client = new FakeCopilotClient();
    const collectedEvents = [];

    client.setSessionConfig({
      _cannedEvents: [
        { type: { value: "tool.execution_start" }, data: { toolName: "read_file" } },
        { type: { value: "assistant.message_delta" }, data: { deltaContent: "Review: " } },
        { type: { value: "session.idle" }, data: {} }
      ],
      _cannedResponse: { data: { content: '{"verdict":"pass","summary":"LGTM"}' } }
    });

    await client.start();
    const session = await client.createSession({ model: "gpt-5.4" });
    session.on((event) => collectedEvents.push(event.type.value));

    const response = await session.sendAndWait({ prompt: "Review this diff" });
    const parsed = parseStructuredOutput(response.data.content);

    assert.equal(parsed.parsed.verdict, "pass");
    assert.deepEqual(collectedEvents, ["tool.execution_start", "assistant.message_delta", "session.idle"]);
  });
});
