export type ClaudeRole = "user" | "assistant";

export interface ClaudeMessage {
  role: ClaudeRole;
  content: string;
}

export interface ClaudeSession {
  session_id: string;
  created_at: string;
  updated_at: string;
  messages: ClaudeMessage[];
}

export interface ClaudeSessionMetadata {
  session_id: string;
  created_at: string;
  last_message_at: string;
  message_count: number;
}

export interface ClaudeResponse {
  session_id: string;
  response: string;
}
