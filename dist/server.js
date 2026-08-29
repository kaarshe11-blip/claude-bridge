#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ClaudeCodeClient } from "./claude.js";
import { config } from "./config.js";
import { SessionStore } from "./sessions.js";
const server = new McpServer({
    name: "claude-conversation-bridge",
    version: "0.1.0"
});
const store = new SessionStore(config.sessionsPath);
const claude = new ClaudeCodeClient(config.claudeCodeCommand, config.claudeCodeModel, config.timeoutMs);
function jsonResult(value) {
    const result = {
        content: [
            {
                type: "text",
                text: JSON.stringify(value, null, 2)
            }
        ]
    };
    if (value && typeof value === "object" && !Array.isArray(value)) {
        result.structuredContent = value;
    }
    return result;
}
function claudeExchangeResult(value) {
    return {
        content: [
            {
                type: "text",
                text: `Sent to Claude:\n${value.prompt_sent}\n\nClaude replied:\n${value.response}`
            },
            {
                type: "text",
                text: JSON.stringify(value, null, 2)
            }
        ],
        structuredContent: value
    };
}
function limitResult(sessionId, messageCount) {
    return jsonResult({
        status: "limit_reached",
        session_id: sessionId,
        message_count: messageCount
    });
}
server.registerTool("claude_start", {
    title: "Start Claude conversation",
    description: "Start a new persistent Claude conversation and wait for Claude's response.",
    inputSchema: {
        prompt: z.string().min(1)
    }
}, async ({ prompt }) => {
    const claudeResponse = await claude.start(prompt);
    const session = await store.create(claudeResponse.sessionId, [
        { role: "user", content: prompt },
        { role: "assistant", content: claudeResponse.response }
    ]);
    return claudeExchangeResult({
        session_id: session.session_id,
        prompt_sent: prompt,
        response: claudeResponse.response
    });
});
server.registerTool("claude_continue", {
    title: "Continue Claude conversation",
    description: "Continue an existing Claude conversation and wait for Claude's response.",
    inputSchema: {
        session_id: z.string().min(1),
        prompt: z.string().min(1)
    }
}, async ({ session_id, prompt }) => {
    const session = await store.get(session_id);
    if (!session) {
        throw new Error(`Unknown Claude session: ${session_id}`);
    }
    if (session.messages.length + 2 > config.maxMessagesPerSession) {
        return limitResult(session.session_id, session.messages.length);
    }
    const userMessage = { role: "user", content: prompt };
    const messages = [...session.messages, userMessage];
    const claudeResponse = await claude.resumeOrContinueWithHistory(session.session_id, prompt, messages);
    await store.append(session.session_id, userMessage);
    await store.append(session.session_id, { role: "assistant", content: claudeResponse.response });
    return claudeExchangeResult({
        session_id: session.session_id,
        prompt_sent: prompt,
        response: claudeResponse.response
    });
});
server.registerTool("claude_end", {
    title: "End Claude conversation",
    description: "Close and delete a persistent Claude conversation.",
    inputSchema: {
        session_id: z.string().min(1)
    }
}, async ({ session_id }) => {
    await store.close(session_id);
    return jsonResult({ status: "closed" });
});
server.registerTool("claude_sessions", {
    title: "List Claude conversations",
    description: "List active Claude conversation IDs and basic metadata.",
    inputSchema: {}
}, async () => {
    return jsonResult(await store.list());
});
const transport = new StdioServerTransport();
await server.connect(transport);
