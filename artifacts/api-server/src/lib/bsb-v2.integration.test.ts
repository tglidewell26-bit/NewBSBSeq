import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

describe("BSB V2 disposable database integration", () => {
  it("preserves the existing database schema and duplicate constraint", async () => {
    const client = await pool.connect();
    const id = randomUUID();
    const owner = `synthetic-owner-${randomUUID()}`;
    const hash = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO bsb_v2_packets
          (id, owner_id, input_hash, evidence_version, stage, research_packet, normalized_evidence, validation)
         VALUES ($1, $2, $3, $3, 'VALIDATED', $4::jsonb, '[]'::jsonb, $5::jsonb)`,
        [id, owner, hash, JSON.stringify({ brief: "Synthetic integration company" }), JSON.stringify({ structurallyValid: true, supportValid: true, errors: [], warnings: [] })],
      );
      const owned = await client.query("SELECT stage FROM bsb_v2_packets WHERE id = $1 AND owner_id = $2", [id, owner]);
      expect(owned.rows[0]?.stage).toBe("VALIDATED");

      await client.query("SAVEPOINT duplicate_check");
      try {
        await client.query(
          `INSERT INTO bsb_v2_packets
            (id, owner_id, input_hash, evidence_version, stage, research_packet, normalized_evidence, validation)
           VALUES ($1, $2, $3, $3, 'VALIDATED', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)`,
          [randomUUID(), owner, hash],
        );
        throw new Error("Expected duplicate owner/input hash to fail");
      } catch (error: any) {
        expect(error.code).toBe("23505");
        await client.query("ROLLBACK TO SAVEPOINT duplicate_check");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
