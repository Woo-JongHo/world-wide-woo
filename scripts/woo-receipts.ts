#!/usr/bin/env bun
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { CommitReceiptStore } from "../src/adapters/outbound/commit-receipt-store.js";

const root = resolve(process.argv[3] ?? "."); const data = resolve(process.env.WWW_DATA_DIR ?? join(homedir(), ".local/share/www")); mkdirSync(join(data, "development"), { recursive: true });
const store = new CommitReceiptStore(root, join(data, "development/commit-receipts.sqlite"));
try { console.log(JSON.stringify(process.argv[2] === "query" ? store.query(process.argv[4] ?? "") : store.rebuild(), null, 2)); }
finally { store.close(); }

