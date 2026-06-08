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
    URL,
  };

  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  return sandbox.window.StartStopLogic;
}

function loadIndexHtml() {
  return readFileSync(new URL("../index.html", import.meta.url), "utf8");
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

test("selected-person records only include the current user", () => {
  const logic = loadAppLogic();
  const records = [
    {
      id: "ada",
      personName: "Ada",
      activityName: "Gym",
      startAt: new Date("2026-06-07T08:00:00").getTime(),
      stopAt: new Date("2026-06-07T09:00:00").getTime(),
      durationMs: 3_600_000,
    },
    {
      id: "ben",
      personName: "Ben",
      activityName: "Gym",
      startAt: new Date("2026-06-07T10:00:00").getTime(),
      stopAt: new Date("2026-06-07T10:30:00").getTime(),
      durationMs: 1_800_000,
    },
  ];

  const visibleRecords = logic.getRecordsForPerson(records, "Ada");
  const totals = logic.getTotals(visibleRecords, new Date("2026-06-07T12:00:00"));

  assert.deepEqual(visibleRecords.map((record) => record.id), ["ada"]);
  assert.equal(totals.today.get("Ada|Gym").durationMs, 3_600_000);
  assert.equal(totals.today.has("Ben|Gym"), false);
});

test("selected-person records are empty when no user is selected", () => {
  const logic = loadAppLogic();
  const records = [
    {
      id: "ada",
      personName: "Ada",
      activityName: "Gym",
      startAt: 1,
      stopAt: 2,
      durationMs: 1,
    },
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(logic.getRecordsForPerson(records, ""))), []);
});

test("deleting a record removes it from history and totals", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();
  state.records = [
    {
      id: "keep",
      personName: "Ada",
      activityName: "Gym",
      startAt: new Date("2026-06-07T08:00:00").getTime(),
      stopAt: new Date("2026-06-07T09:00:00").getTime(),
      durationMs: 3_600_000,
    },
    {
      id: "delete",
      personName: "Ada",
      activityName: "Swimming",
      startAt: new Date("2026-06-07T10:00:00").getTime(),
      stopAt: new Date("2026-06-07T10:30:00").getTime(),
      durationMs: 1_800_000,
    },
  ];

  const deleted = logic.deleteRecord(state, "delete");
  const totals = logic.getTotals(state.records, new Date("2026-06-07T12:00:00"));

  assert.equal(deleted.id, "delete");
  assert.deepEqual(state.records.map((record) => record.id), ["keep"]);
  assert.equal(totals.today.has("Ada|Swimming"), false);
  assert.equal(totals.today.get("Ada|Gym").durationMs, 3_600_000);
});

test("deleting a missing record throws", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();

  assert.throws(() => logic.deleteRecord(state, "missing"), /Record not found/);
});

test("delete record prompt names the selected record", () => {
  const logic = loadAppLogic();
  const message = logic.formatDeleteRecordPrompt({
    personName: "Ada",
    activityName: "Gym",
  });

  assert.equal(message, "Delete Ada · Gym record?");
});

test("remote store reads authenticated JSON content by path", async () => {
  const logic = loadAppLogic();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          path: "/configs/start-stop-activity-state.json",
          content: { records: [{ id: "remote-record" }] },
        };
      },
    };
  };

  const store = logic.createRemoteStore({
    baseUrl: "https://example.test",
    token: "secret-token",
    path: "/configs/start-stop-activity-state.json",
    fetcher,
  });

  const state = await store.load();

  assert.deepEqual(state, { records: [{ id: "remote-record" }] });
  assert.equal(
    calls[0].url,
    "https://example.test/files?path=%2Fconfigs%2Fstart-stop-activity-state.json"
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-token");
});

test("persistent store saves local backup before replacing remote content", async () => {
  const logic = loadAppLogic();
  const localWrites = [];
  const remoteWrites = [];
  const localStore = {
    load() {
      return null;
    },
    save(content) {
      localWrites.push(content);
    },
  };
  const remoteStore = {
    load() {
      return null;
    },
    async save(content) {
      remoteWrites.push(content);
    },
  };
  const store = logic.createPersistentStore({ localStore, remoteStore });
  const state = { records: [{ id: "new-record" }] };

  await store.save(state);

  assert.deepEqual(localWrites, [state]);
  assert.deepEqual(remoteWrites, [state]);
});

test("config store keeps bearer token in localStorage", () => {
  const logic = loadAppLogic();
  const memory = new Map();
  const storage = {
    getItem(key) {
      return memory.get(key) || null;
    },
    setItem(key, value) {
      memory.set(key, value);
    },
    removeItem(key) {
      memory.delete(key);
    },
  };
  const configStore = logic.createConfigStore({
    storage,
    key: "remote-config",
  });

  configStore.saveToken(" secret-token ");

  assert.equal(memory.get("remote-config"), JSON.stringify({ token: "secret-token" }));
  assert.equal(configStore.loadToken(), "secret-token");

  configStore.saveToken("");

  assert.equal(configStore.loadToken(), "");
  assert.equal(memory.has("remote-config"), false);
});

test("url action parses start command for Peter Gym", () => {
  const logic = loadAppLogic();
  const action = logic.parseUrlAction(
    "https://example.test/index.html?action=start&person=Peter&activity=Gym&token=secret-token"
  );

  assert.deepEqual(JSON.parse(JSON.stringify(action)), {
    action: "start",
    personName: "Peter",
    activityName: "Gym",
    token: "secret-token",
  });
});

test("url action starts and stops Peter Gym with current time", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();

  const startResult = logic.applyUrlAction(
    state,
    {
      action: "start",
      personName: "Peter",
      activityName: "Gym",
    },
    10_000
  );

  assert.equal(startResult.message, "Started Peter · Gym.");
  assert.equal(state.activeSessions.Peter.personName, "Peter");
  assert.equal(state.activeSessions.Peter.activityName, "Gym");
  assert.equal(state.activeSessions.Peter.startAt, 10_000);

  const stopResult = logic.applyUrlAction(
    state,
    {
      action: "stop",
      personName: "Peter",
      activityName: "Gym",
    },
    25_000
  );

  assert.equal(stopResult.message, "Stopped Peter · Gym.");
  assert.equal(state.activeSessions.Peter, undefined);
  assert.equal(state.records[0].personName, "Peter");
  assert.equal(state.records[0].activityName, "Gym");
  assert.equal(state.records[0].durationMs, 15_000);
});

test("url action toggles Peter Gym based on active session", () => {
  const logic = loadAppLogic();
  const state = logic.createInitialState();

  const first = logic.applyUrlAction(
    state,
    {
      action: "toggle",
      personName: "Peter",
      activityName: "Gym",
    },
    10_000
  );
  const second = logic.applyUrlAction(
    state,
    {
      action: "toggle",
      personName: "Peter",
      activityName: "Gym",
    },
    13_000
  );

  assert.equal(first.message, "Started Peter · Gym.");
  assert.equal(second.message, "Stopped Peter · Gym.");
  assert.equal(state.records[0].durationMs, 3_000);
});

test("browser startup creates config store before reading URL actions", () => {
  const html = loadIndexHtml();
  const configStoreIndex = html.indexOf("const configStore = logic.createConfigStore");
  const urlActionIndex = html.indexOf("const urlAction = readUrlAction()");

  assert.notEqual(configStoreIndex, -1);
  assert.notEqual(urlActionIndex, -1);
  assert.ok(
    configStoreIndex < urlActionIndex,
    "configStore must be initialized before readUrlAction() can save URL tokens"
  );
});

test("compact UI uses dropdowns for person and activity selection", () => {
  const html = loadIndexHtml();

  assert.match(html, /<select[^>]+id="person-select"/);
  assert.match(html, /<select[^>]+id="activity-select"/);
  assert.doesNotMatch(html, /id="person-list"/);
  assert.doesNotMatch(html, /id="activity-list"/);
});

test("add person and add activity forms live in the hamburger menu", () => {
  const html = loadIndexHtml();
  const menuStart = html.indexOf('id="config-menu"');
  const menuEnd = html.indexOf('<p class="storage-status"', menuStart);
  const menuMarkup = html.slice(menuStart, menuEnd);

  assert.notEqual(menuStart, -1);
  assert.match(menuMarkup, /id="person-form"/);
  assert.match(menuMarkup, /id="activity-form"/);
  assert.match(menuMarkup, /id="remote-token"/);
});
