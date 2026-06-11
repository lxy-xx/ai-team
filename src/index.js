#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { main, runOnce } from "./interfaces/cli/index-cli.js";
import { runEngineCommand } from "./interfaces/cli/engine-cli.js";

export { main, runEngineCommand, runOnce };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
