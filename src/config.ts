import { join } from "node:path";

const defaultDataDir = join(process.cwd(), "data");

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  claudeCodeCommand: process.env.CLAUDE_CODE_COMMAND ?? "claude",
  claudeCodeModel: process.env.CLAUDE_CODE_MODEL,
  maxMessagesPerSession: readPositiveInteger("CLAUDE_MAX_MESSAGES_PER_SESSION", 30),
  timeoutMs: readPositiveInteger("CLAUDE_TIMEOUT_SECONDS", 300) * 1000,
  sessionsPath: process.env.CLAUDE_SESSIONS_PATH ?? join(defaultDataDir, "sessions.json")
};
