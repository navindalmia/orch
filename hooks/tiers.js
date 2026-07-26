"use strict";

const TIERS = [
  { name: "scout", model: "claude-haiku-4-5-20251001" },
  { name: "builder", model: "claude-sonnet-5" },
  { name: "architect", model: "claude-opus-5" }
];

const MODEL_TO_INDEX = new Map(TIERS.map((t, i) => [t.model, i]));
const MODEL_TO_NAME = new Map(TIERS.map((t) => [t.model, t.name]));

function tierIndexForModel(model) {
  return MODEL_TO_INDEX.has(model) ? MODEL_TO_INDEX.get(model) : -1;
}

function tierNameForModel(model) {
  return MODEL_TO_NAME.get(model) || model;
}

module.exports = { TIERS, tierIndexForModel, tierNameForModel };
