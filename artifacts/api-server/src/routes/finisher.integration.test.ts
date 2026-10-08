import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import app from "../app";
import { initializeFinisher } from "./finisher";

// Opt in only against a disposable test database; never use the Replit database.
describe.skipIf(process.env.BSB_FINISHER_TEST_DB !== "true")(
  "Finisher HTTP and persistence",
  () => {
    let server: Server, base: string, saved: any;
    const assetId = randomUUID(),
      accountId = randomUUID(),
      legacyId = randomUUID();
    const send = async (path: string, method = "GET", data?: unknown) => {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as any,
      };
    };
    beforeAll(async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      await initializeFinisher();
      await pool.query(
        "CREATE TABLE IF NOT EXISTS bsb_v2_packets(id text PRIMARY KEY,research_packet jsonb,created_at timestamptz DEFAULT now())",
      );
      await pool.query(
        "CREATE TABLE IF NOT EXISTS bsb_v2_sequence_jobs(id text PRIMARY KEY,packet_id text,authority jsonb,state text,sequence jsonb,draft_touches jsonb,safe_touches jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now())",
      );
      await pool.query(
        "INSERT INTO bsb_v2_packets(id,research_packet) VALUES($1,$2)",
        [
          accountId,
          JSON.stringify({
            brief: "Preserved account\nOriginal research remains.",
          }),
        ],
      );
      await pool.query(
        "INSERT INTO bsb_v2_sequence_jobs(id,packet_id,authority,state,sequence) VALUES($1,$2,'{}','APPROVED',$3)",
        [
          legacyId,
          accountId,
          JSON.stringify([
            {
              touchId: "email1",
              subject: "Old subject",
              body: "Original saved email",
            },
          ]),
        ],
      );
      await pool.query(
        `INSERT INTO bsb_v2_knowledge_assets(id,file_name,display_name,file_type,file_size,file_kind,instrument,research_area,asset_type,description,keywords,storage_path,classification_reasoning,file_data) VALUES($1,'panel.pdf','VistaPlex immune panel','application/pdf',0,'document','CellScape',NULL,'Panels and Brochures','An immune panel.','["immune"]','','Reviewed metadata.','')`,
        [assetId],
      );
      await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => resolve());
      });
      base = `http://127.0.0.1:${(server.address() as any).port}/api/bsb-v2/`;
    });
    afterAll(async () => {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      vi.unstubAllEnvs();
      await pool.end();
    });
    it("finishes, saves, reopens, edits, detects stale updates, and deletes without touching resources or accounts", async () => {
      const input = {
        company: "Earli",
        source:
          "Instrument: CellScape\nEmail 1\nSubject: Immune profiling\nHi, could tumor immune profiling help?\nResource note: A related panel works.",
        timezone: "America/Los_Angeles",
        location: "",
        trip1: [],
        trip2: [],
      };
      const finished = await send("finish", "POST", input);
      expect(finished.status).toBe(200);
      expect(finished.body.suggestions[0].assetId).toBe(assetId);
      const messages = finished.body.messages.map((m: any) => ({
        ...m,
        selectedAssetIds: [assetId],
      }));
      const created = await send("finished", "POST", { input, messages });
      expect(created.status).toBe(201);
      saved = created.body;
      const reopened = await send(`finished/${saved.id}`);
      expect(reopened.body.messages[0].body).toBe(
        "Hi, could tumor immune profiling help?",
      );
      expect(reopened.body.resources[0].id).toBe(assetId);
      const edited = messages.map((m: any) => ({
        ...m,
        body: "My revised wording.",
      }));
      const update = await send(`finished/${saved.id}`, "PUT", {
        input,
        messages: edited,
        expectedUpdatedAt: saved.updatedAt,
      });
      expect(update.status).toBe(200);
      expect(
        (
          await send(`finished/${saved.id}`, "PUT", {
            input,
            messages,
            expectedUpdatedAt: saved.updatedAt,
          })
        ).status,
      ).toBe(409);
      expect(
        (await send("finished")).body.some((x: any) => x.id === saved.id),
      ).toBe(true);
      expect((await send(`finished/${saved.id}`, "DELETE")).status).toBe(200);
      expect((await send(`finished/${saved.id}`)).status).toBe(404);
      expect(
        (await send("assets")).body.some((x: any) => x.id === assetId),
      ).toBe(true);
      expect(
        (await send("saved-accounts")).body.some(
          (x: any) => x.id === accountId,
        ),
      ).toBe(true);
    });
    it("shows earlier sequences and preserves their original text", async () => {
      const list = await send("finished");
      expect(list.body.some((x: any) => x.id === `legacy-${legacyId}`)).toBe(
        true,
      );
      const old = await send(`finished/legacy-${legacyId}`);
      expect(old.body.messages[0].body).toBe("Original saved email");
      expect(old.body.input.company).toContain("Preserved account");
    });
    it("rejects removed resource selections and no longer exposes assessment generation", async () => {
      expect(
        (
          await send("finished", "POST", {
            input: { company: "X", source: "Email 1\nHello" },
            messages: [
              {
                id: "message-1",
                title: "Email 1",
                subject: "",
                body: "Hello",
                resourceNote: "",
                selectedAssetIds: ["missing"],
              },
            ],
          })
        ).status,
      ).toBe(409);
      const response = await fetch(base + "packets/any/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(404);
    });
  },
);
