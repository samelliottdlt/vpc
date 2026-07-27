# @vpc/current-time — current time inside the vpc

Answers "what time is it where this container runs?". Read
`.github/copilot-instructions.md` first.

## Surface

| Transport | Call                                           |
| --------- | ---------------------------------------------- |
| REST      | `GET /current-time?timeZone=Asia/Tokyo`        |
| JSON-RPC  | `{"method":"current-time.now","params":{...}}` |

Response:

```json
{
  "epochMs": 1785176748182,
  "iso": "2026-07-27T18:25:48.182Z",
  "timeZone": "UTC",
  "formatted": "Monday, July 27, 2026 at 6:25:48 PM UTC",
  "offsetMinutes": 0
}
```

## Invariants

- `describeTime(instant, timeZone)` in `now.ts` is pure. The clock is read only in the
  procedure handler in `index.ts`, which is what keeps the behavior testable without a server
  or a fake timer. Do not move `new Date()` into `now.ts`.
- `epochMs` and `iso` always describe the same UTC instant. `timeZone`, `formatted`, and
  `offsetMinutes` are presentation of that instant. Never shift `epochMs` to "apply" a zone.
- `timeZone` is an IANA name. Omitted or empty means the container's resolved zone, which is
  UTC in the image. Unknown zones are `bad_request`, never a silent fallback.
- `offsetMinutes` is computed per instant via `Intl`, so daylight saving is handled. It is not
  a constant per zone — the tests assert `America/New_York` at both -240 and -300.
- This package depends on `@vpc/api` only. It must stay unaware of HTTP.

## Validation

`src/now.test.ts` covers UTC output, DST-aware offsets, unknown zones, and input coercion. It
uses a fixed instant; keep it that way so the tests are deterministic.
