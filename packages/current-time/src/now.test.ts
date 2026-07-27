import assert from "node:assert/strict";
import test from "node:test";

import { isApiError } from "@vpc/api";

import { describeTime, nowInput } from "./now.js";

const instant = new Date("2024-06-01T12:34:56.789Z");

test("describeTime reports the instant in UTC", () => {
  const result = describeTime(instant, "UTC");
  assert.equal(result.epochMs, instant.getTime());
  assert.equal(result.iso, "2024-06-01T12:34:56.789Z");
  assert.equal(result.timeZone, "UTC");
  assert.equal(result.offsetMinutes, 0);
});

test("describeTime computes daylight-saving aware offsets", () => {
  assert.equal(describeTime(instant, "America/New_York").offsetMinutes, -240);
  assert.equal(
    describeTime(new Date("2024-01-01T12:00:00Z"), "America/New_York")
      .offsetMinutes,
    -300,
  );
  assert.equal(describeTime(instant, "Asia/Kolkata").offsetMinutes, 330);
});

test("describeTime rejects unknown time zones with bad_request", () => {
  assert.throws(
    () => describeTime(instant, "Mars/Olympus_Mons"),
    (error: unknown) => isApiError(error) && error.code === "bad_request",
  );
});

test("nowInput treats missing or empty time zones as the container default", () => {
  assert.deepEqual(nowInput.parse(undefined), {});
  assert.deepEqual(nowInput.parse({}), {});
  assert.deepEqual(nowInput.parse({ timeZone: "" }), {});
  assert.deepEqual(nowInput.parse({ timeZone: "UTC" }), { timeZone: "UTC" });
});

test("nowInput rejects non-string time zones", () => {
  assert.throws(() => nowInput.parse({ timeZone: 5 }));
});
