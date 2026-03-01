import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { chmodSync } from "fs";
import { join } from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

type BridgeEnvelope = {
  id?: string;
  success?: boolean;
  result?: unknown;
  error?: string;
  code?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export function getBridgeBinaryName(platform: NodeJS.Platform): string {
  if (platform === "win32") return "patcher-win.exe";
  if (platform === "darwin") return "patcher-mac";
  return "patcher-linux";
}

export class PatcherBridge {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private readonly pending = new Map<string, PendingRequest>();
  private disposed = false;

  constructor(
    private readonly options: {
      getRuntimeDir: () => string;
      platform: NodeJS.Platform;
      requestTimeoutMs?: number;
      onStderr?: (message: string) => void;
    },
  ) {}

  getBinaryPath(): string {
    return join(
      this.options.getRuntimeDir(),
      getBridgeBinaryName(this.options.platform),
    );
  }

  async request<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    if (this.disposed) {
      throw new Error("Bridge is disposed.");
    }

    const child = this.ensureStarted();
    const requestId = randomUUID();
    const message = JSON.stringify({
      id: requestId,
      ...payload,
    });

    return await new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? 120_000;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(`Bridge request timed out after ${timeoutMs}ms (${requestId}).`),
        );
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timer,
      });

      child.stdin.write(`${message}\n`, (err) => {
        if (!err) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        clearTimeout(pending.timer);
        pending.reject(
          new Error(
            `Failed to write request to bridge stdin: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    this.rejectAll(new Error("Bridge process disposed."));

    if (!this.child) return;
    try {
      this.child.stdin.end();
    } catch {
      // ignore
    }
    try {
      this.child.kill();
    } catch {
      // ignore
    }
    this.child = null;
    this.stdoutBuffer = "";
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) {
      return this.child;
    }

    const binaryPath = this.getBinaryPath();
    if (!existsSync(binaryPath)) {
      throw new Error(`Bridge executable was not found: ${binaryPath}`);
    }

    if (this.options.platform !== "win32") {
      try {
        chmodSync(binaryPath, 0o755);
      } catch {
        // Best effort. If chmod fails, spawn may still succeed.
      }
    }

    const child = spawn(binaryPath, [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => this.handleStdoutChunk(String(chunk)));
    child.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (!message) return;
      this.options.onStderr?.(message);
    });

    child.on("error", (err) => {
      this.rejectAll(
        new Error(
          `Bridge process error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
      this.child = null;
    });

    child.on("close", (code, signal) => {
      const reason =
        signal !== null
          ? `signal ${signal}`
          : `exit code ${code ?? "unknown"}`;
      this.rejectAll(new Error(`Bridge process closed (${reason}).`));
      this.child = null;
      this.stdoutBuffer = "";
    });

    this.child = child;
    return child;
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;

      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;

      this.handleStdoutLine(line);
    }
  }

  private handleStdoutLine(line: string): void {
    let envelope: BridgeEnvelope;
    try {
      envelope = JSON.parse(line) as BridgeEnvelope;
    } catch {
      this.rejectAll(new Error(`Bridge emitted invalid JSON: ${line}`));
      return;
    }

    const requestId = envelope.id;
    if (!requestId) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(requestId);
    clearTimeout(pending.timer);

    if (envelope.success === false) {
      const message =
        envelope.error ||
        `Bridge request failed (${envelope.code ?? "unknown_error"}).`;
      pending.reject(new Error(message));
      return;
    }

    pending.resolve(envelope.result);
  }

  private rejectAll(error: Error): void {
    if (this.pending.size === 0) return;
    for (const [requestId, pending] of this.pending.entries()) {
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

