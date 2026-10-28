import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { err, ok, type Result } from "../result.ts";

// Private file storage: Supabase Storage in production, `.data/files/<bucket>/` locally and in tests.
export type FileStore = {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<Result<void>>;
  get(path: string): Promise<Result<Uint8Array>>;
};

export type FileStoreConfig = {
  driver: "supabase" | "local";
  supabaseUrl?: string;
  serviceRoleKey?: string;
  bucket: string;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function createFileStore(config: FileStoreConfig): FileStore {
  if (config.driver === "local") {
    const base = join(repoRoot, ".data", "files", config.bucket);
    const target = (path: string) => {
      const full = resolve(base, path);
      if (!full.startsWith(base)) throw new Error(`Path outside the bucket: ${path}`);
      return full;
    };
    return {
      async put(path, bytes) {
        try {
          const full = target(path);
          await mkdir(dirname(full), { recursive: true });
          await writeFile(full, bytes);
          return ok(undefined);
        } catch (error) {
          return err("INTERNAL", `Storage put: ${(error as Error).message}`);
        }
      },
      async get(path) {
        try {
          return ok(new Uint8Array(await readFile(target(path))));
        } catch (error) {
          const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
          return err(
            missing ? "NOT_FOUND" : "INTERNAL",
            `Storage get: ${(error as Error).message}`,
          );
        }
      },
    };
  }

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error("Supabase storage needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  const bucket = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  }).storage.from(config.bucket);
  return {
    async put(path, bytes, contentType) {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert: true });
      return error ? err("INTERNAL", `Storage put: ${error.message}`) : ok(undefined);
    },
    async get(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return err("NOT_FOUND", `Storage get: ${error?.message ?? "sin datos"}`);
      return ok(new Uint8Array(await data.arrayBuffer()));
    },
  };
}
