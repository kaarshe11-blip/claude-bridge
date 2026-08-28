import { spawn } from "node:child_process";
export class ClaudeCodeClient {
    command;
    model;
    timeoutMs;
    constructor(command, model, timeoutMs) {
        this.command = command;
        this.model = model;
        this.timeoutMs = timeoutMs;
    }
    async start(prompt) {
        return this.run(["-p", prompt, "--output-format", "json"]);
    }
    async resume(sessionId, prompt) {
        return this.run(["-p", prompt, "--resume", sessionId, "--output-format", "json"]);
    }
    async continueWithHistory(messages) {
        return this.run(["-p", this.formatHistoryPrompt(messages), "--output-format", "json"]);
    }
    async run(args) {
        const fullArgs = [...args];
        if (this.model) {
            fullArgs.push("--model", this.model);
        }
        const output = await new Promise((resolve, reject) => {
            const child = spawn(this.command, fullArgs, {
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
                env: process.env
            });
            let stdout = "";
            let stderr = "";
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Claude Code timed out after ${this.timeoutMs / 1000} seconds.`));
            }, this.timeoutMs);
            child.stdout.setEncoding("utf8");
            child.stderr.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
                stdout += chunk;
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk;
            });
            child.on("error", (error) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start Claude Code command "${this.command}". Install Claude Code and run "claude /login", or set CLAUDE_CODE_COMMAND to its executable path. ${error.message}`));
            });
            child.on("close", (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve({ stdout, stderr });
                    return;
                }
                const parsedError = this.tryParseJson(stdout);
                if (parsedError?.is_error) {
                    reject(new Error(parsedError.result || parsedError.error || `Claude Code exited with code ${code}.`));
                    return;
                }
                reject(new Error(`Claude Code exited with code ${code}. ${stderr.trim() || stdout.trim()}`));
            });
        });
        const parsed = this.parseJson(output.stdout);
        if (parsed.is_error) {
            throw new Error(parsed.error || parsed.result || "Claude Code returned an error.");
        }
        if (!parsed.session_id) {
            throw new Error("Claude Code JSON output did not include session_id.");
        }
        return {
            sessionId: parsed.session_id,
            response: parsed.result?.trim() ?? ""
        };
    }
    parseJson(stdout) {
        const trimmed = stdout.trim();
        if (!trimmed) {
            throw new Error("Claude Code produced no stdout.");
        }
        try {
            return JSON.parse(trimmed);
        }
        catch {
            const jsonLine = trimmed
                .split(/\r?\n/)
                .reverse()
                .find((line) => line.trim().startsWith("{") && line.trim().endsWith("}"));
            if (jsonLine) {
                return JSON.parse(jsonLine);
            }
            throw new Error(`Claude Code did not produce valid JSON output: ${trimmed}`);
        }
    }
    tryParseJson(stdout) {
        try {
            return this.parseJson(stdout);
        }
        catch {
            return undefined;
        }
    }
    formatHistoryPrompt(messages) {
        const transcript = messages
            .map((message) => {
            const speaker = message.role === "user" ? "Codex" : "Claude";
            return `${speaker}:\n${message.content}`;
        })
            .join("\n\n");
        return [
            "Continue the following conversation between Codex and Claude.",
            "Answer the final Codex message as Claude, using the earlier messages as context.",
            "Do not mention that the transcript was replayed unless it is directly relevant.",
            "",
            transcript
        ].join("\n");
    }
}
