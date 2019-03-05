import { DateTime, ISOTimeOptions } from "luxon"

import { first, map, Maybe, orElse } from "./Maybe"
import { blank, notBlank, toS } from "./String"
import { offsetMinutesToZoneName } from "./Timezones"

// Not in typings:
const { FixedOffsetZone } = require("luxon")
const unsetZoneOffset = -24 * 60
const unsetZone = new FixedOffsetZone(unsetZoneOffset)

/**
 * Encodes an ExifDateTime with an optional tz offset in minutes.
 */
export class ExifDateTime {
  static fromISO(
    iso: string,
    defaultZone?: Maybe<string>
  ): Maybe<ExifDateTime> {
    return blank(iso)
      ? undefined
      : this.fromDateTime(
          DateTime.fromISO(iso, {
            setZone: true,
            zone: orElse(defaultZone, unsetZone)
          })
        )
  }

  /**
   * Try to parse a date-time string from EXIF. If there is not both a date and
   * a time component, returns `undefined`.
   *
   * @param text from EXIF metadata
   * @param defaultZone a "zone name" which may be IANA, like
   * "America/Los_Angeles", or an offset, like "UTC-3". See
   * `offsetMinutesToZoneName`.
   */
  static fromEXIF(
    text: string,
    defaultZone?: Maybe<string>
  ): Maybe<ExifDateTime> {
    if (blank(text)) return
    const s = toS(text).trim()
    const inputs = [s]

    // Some EXIF datetime will "over-specify" and include both the utc offset
    // *and* the "time zone abbreviation", like PST or PDT.
    // TZAs are between 2 (AT) and 5 (WEST) characters.

    // Unfortunately, luxon doesn't support regex.
    const noTza = s.replace(/ [a-z]{2,5}$/i, "")
    if (noTza !== s) inputs.push(noTza)

    const zone = notBlank(defaultZone) ? defaultZone : unsetZone

    const fmts = [
      { fmt: "y:M:d H:m:s.uZZ" },
      { fmt: "y:M:d H:m:sZZ" },
      { fmt: "y:M:d H:m:s.u'Z'", zone: "utc" },
      { fmt: "y:M:d H:m:s'Z'", zone: "utc" },
      { fmt: "y:M:d H:m:s.u", zone },
      { fmt: "y:M:d H:m:s", zone },
      // FWIW, the following are from actual datestamps seen in the wild:
      { fmt: "MMM d y H:m:sZZZ" },
      { fmt: "MMM d y H:m:s", zone },
      { fmt: "MMM d y, H:m:sZZZ" },
      { fmt: "MMM d y, H:m:s", zone },
      // Thu Oct 13 00:12:27 2016:
      { fmt: "ccc MMM d H:m:s yZZ" },
      { fmt: "ccc MMM d H:m:s y", zone }
    ]

    return orElse(
      first(inputs, input =>
        first(fmts, ({ fmt, zone: fmtZone }) =>
          map(
            DateTime.fromFormat(input, fmt, { setZone: true, zone: fmtZone }),
            dt => this.fromDateTime(dt)
          )
        )
      ),
      () => this.fromISO(s, defaultZone)
    )
  }

  static fromDateTime(dt: DateTime): Maybe<ExifDateTime> {
    if (
      dt == null ||
      !dt.isValid ||
      dt.toMillis() === 0 ||
      dt.year === 0 ||
      dt.year === 1
    ) {
      return undefined
    }
    return new ExifDateTime(
      dt.year,
      dt.month,
      dt.day,
      dt.hour,
      dt.minute,
      dt.second,
      dt.millisecond,
      dt.offset === unsetZoneOffset ? undefined : dt.offset
    )
  }

  constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
    readonly hour: number,
    readonly minute: number,
    readonly second: number,
    readonly millisecond?: number,
    readonly tzoffsetMinutes?: number
  ) {}

  get millis() {
    return this.millisecond
  }

  get zone() {
    return offsetMinutesToZoneName(this.tzoffsetMinutes)
  }

  toDateTime(): DateTime {
    return DateTime.fromObject(this)
  }

  toDate(): Date {
    return this.toDateTime().toJSDate()
  }

  toISOString(options: ISOTimeOptions = {}): string {
    return this.toDateTime().toISO({
      ...options,
      includeOffset: this.tzoffsetMinutes != null
    })
  }

  toString() {
    return this.toISOString()
  }
}
