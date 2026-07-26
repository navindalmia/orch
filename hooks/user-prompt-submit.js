#!/usr/bin/env node
"use strict";

const { readState, writeState } = require("./turn-state.js");

// New user turn: forget last turn's violation count, delegation flag, and dispatch log,
// but carry sessionEffort forward — it's the session's live current level, not per-turn state.
const previous = readState();
writeState({ violations: 0, delegatedThisTurn: false, dispatches: [], sessionEffort: previous.sessionEffort });

process.exit(0);
