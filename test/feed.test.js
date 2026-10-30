import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

const item = (item_Name, item_Type) => ({ item_Name, item_Type });
const line = (name, items) => ({ name, foodItemList: { data: items } });
const data = { menuSchedules: [{
  dateInformation: { dateFull: "2026-10-29T00:00:00" },
  menuBlocks: [{ blockName: "Lunch", cafeteriaLineList: { data: [
    line("Other Campus", [item("Other Campus Pizza", "ENTREES"), item("*OTHER SPECIAL*", "ENTREES")]),
    line("Selected Campus ", [item("Chicken Bowl", "Hot Food "), item("Rice", "Hot Food"),
      item("Apple", "Fruits"), item("Milk", "Milk"), item("Ketchup", "Condiments")]),
  ] } }],
}] };

async function calendar(env) {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.fetch = async () => Response.json(data);
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  try {
    const response = await worker.fetch(new Request("https://example.test/lunch.ics"), env, { waitUntil() {} });
    return { status: response.status, text: (await response.text()).replace(/\r\n /g, "") };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
}

const base = { SCHOOL_ID: "ExampleSchool", TIMEZONE: "America/New_York" };
const feed = { MEAL: "Lunch", CAFETERIA_LINE: " selected campus ",
  TYPE_MAP: { "Hot Food": "ENTREES", Fruits: "FRUIT" }, TITLE_EXCLUDE: ["Rice"] };

test("selects only the requested campus and maps categories while keeping sides in notes", async () => {
  const result = await calendar({ ...base, FEEDS: { lunch: feed } });
  assert.equal(result.status, 200);
  assert.match(result.text, /SUMMARY:🍽 Lunch: Chicken Bowl\r\n/);
  assert.match(result.text, /DESCRIPTION:Entrées: Chicken Bowl\\, Rice\\nFruit: Apple/);
  assert.doesNotMatch(result.text, /Other Campus|OTHER SPECIAL|Milk|Ketchup/);
  assert.match(result.text, /UID:lunch-ExampleSchool-20261029@school-lunch/);
  assert.match(result.text, /DTSTART;VALUE=DATE:20261029\r\nDTEND;VALUE=DATE:20261030/);
});

test("a missing campus never falls back to other campuses", async () => {
  const result = await calendar({ ...base, FEEDS: { lunch: { ...feed, CAFETERIA_LINE: "Missing" } } });
  assert.equal(result.status, 200);
  assert.doesNotMatch(result.text, /BEGIN:VEVENT/);
});

test("legacy configuration continues to include ordinary entree categories", async () => {
  const result = await calendar({ ...base, MEAL: "Lunch" });
  assert.equal(result.status, 200);
  assert.match(result.text, /Other Campus Pizza/);
});
