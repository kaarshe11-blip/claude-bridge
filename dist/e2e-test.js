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
    const text = content?.find((item) => item.type === "text")?.text;
    if (!text) {
        throw new Error("Tool result did not include text content.");
    }
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(text);
    }
}
async function callTool(name, args) {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000, maxTotalTimeout: 300_000 });
    return parseToolText(result);
}
await client.connect(transport);
try {
    const turn1 = await callTool("claude_start", {
        prompt: "Which is better for a small internal service: a queue-based architecture or a synchronous API? Give a short answer."
    });
    const sessionId = String(turn1.session_id);
    console.log("Turn 1 session:", sessionId);
    console.log(String(turn1.response));
    console.log("");
    const turn2 = await callTool("claude_continue", {
        session_id: sessionId,
        prompt: "Now assume latency matters much more than reliability. Does your answer change?"
    });
    console.log("Turn 2:");
    console.log(String(turn2.response));
    console.log("");
    const turn3 = await callTool("claude_continue", {
        session_id: sessionId,
        prompt: "Summarize the tradeoff we have been discussing."
    });
    console.log("Turn 3:");
    console.log(String(turn3.response));
    console.log("");
    await callTool("claude_end", { session_id: sessionId });
    console.log("Closed session:", sessionId);
}
finally {
    await client.close();
}
