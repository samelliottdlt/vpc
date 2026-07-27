import { defineProcedure, definePackage, type ApiPackage } from "@vpc/api";

import {
  defaultTimeZone,
  describeTime,
  nowInput,
  type NowOutput,
} from "./now.js";

export type { NowInput, NowOutput } from "./now.js";
export { defaultTimeZone, describeTime } from "./now.js";

export const now = defineProcedure({
  name: "now",
  summary: "Current time as observed inside the vpc.",
  input: nowInput,
  rest: { method: "GET", path: "/" },
  handler: (input): NowOutput =>
    describeTime(new Date(), input.timeZone ?? defaultTimeZone()),
});

export const currentTimePackage: ApiPackage = definePackage({
  name: "current-time",
  description: "Reports the current time as observed inside the vpc.",
  procedures: [now],
});

export default currentTimePackage;
