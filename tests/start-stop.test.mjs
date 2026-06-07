import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadAppLogic() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(
    /<script id="app-logic" type="text\/javascript">([\s\S]*?)<\/script>/
  );

  assert.ok(match, "index.html should expose the app logic script");

  const sandbox = {
    window: {},
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    crypto: {
      randomUUID() {
        return "test-id";
      },
    },
    setInterval() {},
  };

  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  return sandbox.window.StartStopLogic;
}

test("starting a session prevents another active session for the same person", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();

  logic.addPerson(state, "Ada");
  logic.startSession(state, "Ada", "Gym", 1_000);

  assert.throws(
    () => logic.startSession(state, "Ada", "Swimming", 2_000),
    /already has an active session/
  );
});

test("stopping a session records start, stop, and duration", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();

  logic.addPerson(state, "Ada");
  logic.startSession(state, "Ada", "Gym", 1_000);
  const record = logic.stopSession(state, "Ada", 6_500);

  assert.equal(record.personName, "Ada");
  assert.equal(record.activityName, "Gym");
  assert.equal(record.startAt, 1_000);
  assert.equal(record.stopAt, 6_500);
  assert.equal(record.durationMs, 5_500);
  assert.equal(state.activeSessions.Ada, undefined);
  assert.equal(state.records.length, 1);
});

test("totals group duration by person and activity", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();
  state.records = [
    {
      id: "1",
      personName: "Ada",
      activityName: "Gym",
      startAt: new Date("2026-06-07T08:00:00").getTime(),
      stopAt: new Date("2026-06-07T09:00:00").getTime(),
      durationMs: 3_600_000,
    },
    {
      id: "2",
      personName: "Ada",
      activityName: "Swimming",
      startAt: new Date("2026-06-07T10:00:00").getTime(),
      stopAt: new Date("2026-06-07T10:30:00").getTime(),
      durationMs: 1_800_000,
    },
    {
      id: "3",
      personName: "Ben",
      activityName: "Gym",
      startAt: new Date("2026-06-06T08:00:00").getTime(),
      stopAt: new Date("2026-06-06T08:15:00").getTime(),
      durationMs: 900_000,
    },
  ];

  const totals = logic.getTotals(state.records, new Date("2026-06-07T12:00:00"));

  assert.equal(totals.allTime.get("Ada|Gym").durationMs, 3_600_000);
  assert.equal(totals.allTime.get("Ada|Swimming").durationMs, 1_800_000);
  assert.equal(totals.allTime.get("Ben|Gym").durationMs, 900_000);
  assert.equal(totals.today.get("Ada|Gym").durationMs, 3_600_000);
  assert.equal(totals.today.get("Ada|Swimming").durationMs, 1_800_000);
  assert.equal(totals.today.has("Ben|Gym"), false);
});
