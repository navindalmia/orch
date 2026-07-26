#!/usr/bin/env node
"use strict";

const TIER_NAMES = {
  "claude-haiku-4-5-20251001": "scout",
  "claude-sonnet-5": "builder",
  "claude-opus-5": "architect"
};

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
    return;
  }

  const toolInput = input.tool_input || {};
  const model = toolInput.model || "(session default)";
  const tierName = TIER_NAMES[model] || model;
  const subagentType = toolInput.subagent_type || "general-purpose";
  const effort = toolInput.effort || toolInput.reasoning_effort || "unspecified";
  const description = toolInput.description || toolInput.prompt || "(no description)";
  const shortDescription = String(description).slice(0, 120);

  process.stderr.write(
    `[orch] -> dispatching ${tierName} (${subagentType}, effort=${effort}): ${shortDescription}\n`
  );

  // Non-blocking: always allow the tool call through unmodified.
  process.exit(0);
}

main();
