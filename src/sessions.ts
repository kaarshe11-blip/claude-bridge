import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClaudeMessage, ClaudeSession, ClaudeSessionMetadata } from "./types.js";

interface SessionsFile {
  sessions: ClaudeSession[];
}

export class SessionStore {
  private sessions = new Map<string, ClaudeSession>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async create(sessionId: string, messages: ClaudeMessage[]): Promise<ClaudeSession> {
    await this.load();

    const now = new Date().toISOString();
    const session: ClaudeSession = {
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      messages
    };

    this.sessions.set(session.session_id, session);
    await this.save();
    return session;
  }

  async get(sessionId: string): Promise<ClaudeSession | undefined> {
    await this.load();
    return this.sessions.get(sessionId);
  }

  async append(sessionId: string, message: ClaudeMessage): Promise<ClaudeSession> {
    await this.load();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown Claude session: ${sessionId}`);
    }

    session.messages.push(message);
    session.updated_at = new Date().toISOString();
    await this.save();
    return session;
  }

  async close(sessionId: string): Promise<boolean> {
    await this.load();
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  async list(): Promise<ClaudeSessionMetadata[]> {
    await this.load();

    return [...this.sessions.values()]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((session) => ({
        session_id: session.session_id,
        created_at: session.created_at,
        last_message_at: session.updated_at,
        message_count: session.messages.length
      }));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as SessionsFile;
      for (const session of parsed.sessions ?? []) {
        this.sessions.set(session.session_id, session);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const payload: SessionsFile = {
      sessions: [...this.sessions.values()]
    };

    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}
