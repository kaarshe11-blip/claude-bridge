import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "server.js");
const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: process.env
});
const client = new Client({
    name: "claude-conversation-mcp-e2e",
    version: "0.1.0"
});
function parseToolText(result) {
    const content = result.content;
    let text;
    for (const item of content ?? []) {
        if (item.type === "text" && item.text?.trim().startsWith("{")) {
            text = item.text;
        }
    }
    if (!text) {
        throw new Error("Tool result did not include JSON text content.");
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(text);
    }
}
function assertVisibleExchange(result, prompt) {
    const content = result.content;
    const visible = content?.find((item) => item.type === "text")?.text ?? "";
    if (!visible.includes("Sent to Claude:\n") || !visible.includes(prompt) || !visible.includes("\n\nClaude replied:\n")) {
        throw new Error("Tool result did not include the visible Claude exchange transcript.");
    }
}
async function callTool(name, args) {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 });
    if (typeof args.prompt === "string") {
        assertVisibleExchange(result, args.prompt);
    }
    return parseToolText(result);
}
await client.connect(transport);
try {
    const prompt1 = "Which is better for a small internal service: a queue-based architecture or a synchronous API? Give a short answer.";
    const turn1 = await callTool("claude_start", {
        prompt: prompt1
    });
    const sessionId = String(turn1.session_id);
    if (turn1.prompt_sent !== prompt1) {
        throw new Error("claude_start did not echo prompt_sent.");
    }
    console.log("Turn 1 session:", sessionId);
    console.log("Sent to Claude:");
    console.log(String(turn1.prompt_sent));
    console.log("Claude replied:");
    console.log(String(turn1.response));
    console.log("");
    const prompt2 = "Now assume latency matters much more than reliability. Does your answer change?";
    const turn2 = await callTool("claude_continue", {
        session_id: sessionId,
        prompt: prompt2
    });
    if (turn2.prompt_sent !== prompt2) {
        throw new Error("claude_continue turn 2 did not echo prompt_sent.");
    }
    console.log("Turn 2:");
    console.log("Sent to Claude:");
    console.log(String(turn2.prompt_sent));
    console.log("Claude replied:");
    console.log(String(turn2.response));
    console.log("");
    const prompt3 = "Summarize the tradeoff we have been discussing.";
    const turn3 = await callTool("claude_continue", {
        session_id: sessionId,
        prompt: prompt3
    });
    if (turn3.prompt_sent !== prompt3) {
        throw new Error("claude_continue turn 3 did not echo prompt_sent.");
    }
    console.log("Turn 3:");
    console.log("Sent to Claude:");
    console.log(String(turn3.prompt_sent));
    console.log("Claude replied:");
    console.log(String(turn3.response));
    console.log("");
    await callTool("claude_end", { session_id: sessionId });
    console.log("Closed session:", sessionId);
}
finally {
    await client.close();
}
