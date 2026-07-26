#!/usr/bin/env node
"use strict";

const { readState, writeState } = require("./turn-state.js");

// Cap on how many times we'll block the same turn over a missing summary —
// after this many nudges, let the stop through anyway rather than risk a
// stall if the model still won't comply.
const MAX_NUDGES = 1;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(""));
  });
}

function summarizeDispatches(state) {
  if (!state.dispatches || state.dispatches.length === 0) {
    return "no dispatches this turn — you handled it directly, so the summary should state that plus a" +
      " trivial/standard/complex label";
  }
  return state.dispatches.map((d) => `${d.tier}(${d.effort})`).join(", ");
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

  const lastMessage = String(input.last_assistant_message || "");
  if (/orch:/i.test(lastMessage)) {
    // Already present — nothing to do.
    process.exit(0);
    return;
  }

  const state = readState();
  const nudges = state.summaryNudges || 0;
  if (nudges >= MAX_NUDGES) {
    // Already nudged once this turn and it's still missing — let it go rather than loop.
    process.exit(0);
    return;
  }

  state.summaryNudges = nudges + 1;
  writeState(state);

  const dispatchSummary = summarizeDispatches(state);
  const effortNote = state.sessionEffort ? `, session effort=${state.sessionEffort}` : "";

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: `One more thing before this turn wraps up: add the orch: routing summary line.` +
        ` This turn's data: ${dispatchSummary}${effortNote}. No need to redo any of the actual work —` +
        ' just append one line starting with "orch:" reporting it.'
    })
  );
  process.exit(0);
}

main();
