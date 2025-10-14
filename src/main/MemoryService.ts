import { ChromaClient } from "chromadb";
import { randomUUID } from "crypto";
import { app } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";

class MemoryService {
    private client: ChromaClient | null = null;
    private chromaProcess: ChildProcess | null = null;
    private collection: any = null;

    async initialize() {
        this.startChromaServer();
        await this.waitForServerReady();
        this.client = new ChromaClient();
        this.collection = await this.client.getOrCreateCollection({ name: "default" });
        console.log("ChromaDB memory ready");
    }

    private startChromaServer() {
        const chromaPath = path.join(app.getPath("userData"), "chroma-data");
        this.chromaProcess = spawn("npx", ["chroma", "run", "--path", chromaPath]);

        this.chromaProcess.on("error", () => (this.chromaProcess = null));

        this.chromaProcess.stderr?.on("data", (data) => {
            const msg = data.toString();
            if (!msg.includes("OpenTelemetry")) console.error("ChromaDB:", msg);
        });

        this.chromaProcess.on("exit", () => (this.chromaProcess = null));
    }

    private async waitForServerReady(maxAttempts = 30, delayMs = 200) {
        const testClient = new ChromaClient();
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await testClient.heartbeat();
                return;
            } catch {
                await new Promise((r) => setTimeout(r, delayMs));
            }
        }
        throw new Error("ChromaDB server failed to start");
    }

    async add(documents: string[], metadatas?: Record<string, unknown>[], ids?: string[]) {
        if (!this.collection) throw new Error("MemoryService not initialized");
        return await this.collection.add({
            documents,
            metadatas: metadatas || [],
            ids: ids || documents.map(() => `doc_${randomUUID()}`),
        });
    }

    async query(queryTexts: string[], nResults = 3) {
        if (!this.collection) throw new Error("MemoryService not initialized");
        return await this.collection.query({ queryTexts, nResults });
    }

    async clear() {
        if (!this.collection) throw new Error("MemoryService not initialized");
        const result = await this.collection.get();
        if (result.ids?.length) await this.collection.delete({ ids: result.ids });
    }

    isInitialized() {
        return this.collection !== null;
    }

    async cleanup() {
        this.client = null;
        this.collection = null;
        if (this.chromaProcess) {
            this.chromaProcess.kill();
            this.chromaProcess = null;
        }
    }
}

const memoryService = new MemoryService();
export default memoryService;