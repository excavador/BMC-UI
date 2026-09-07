import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import TableItem from "@/components/TableItem";
import { Slider } from "@/components/ui/slider";
import {
  type ThermalSensor,
  useCoolingDevicesQuery,
  useThermalQuery,
} from "@/lib/api/get";
import { useCoolingDeviceMutation } from "@/lib/api/set";
import { fanDutyPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One fan, merged from the two endpoints that describe it.
 *
 * `type=cooling` says what can be commanded; `type=thermal` says where the
 * fan actually is. They are not the same number and the difference is the
 * point of this card, so they are kept apart rather than averaged into one.
 */
interface FanRow {
  name: string;
  /** Highest step. From the controllable side when there is one. */
  max: number;
  /** The step the board reports now, or null when nothing reported one. */
  live: number | null;
  /** The setpoint `type=cooling` returned at mount; the slider's origin. */
  setpoint: number | null;
  /** False for a fan only `type=thermal` knows: there is nothing to set. */
  controllable: boolean;
  /** False only when `type=thermal` says the device is not there. */
  present: boolean;
  /** The board's own cooling-levels table, or null when it reports none. */
  levels: number[] | null;
  /** The level that means full duty. Null when the table is unreadable. */
  maxLevel: number | null;
}

/**
 * The fan's step, drawn as the discrete thing it is.
 *
 * The card used to render `Math.round(speed / max_speed * 100)` and print it
 * with a percent sign. That number was wrong in two separate ways. It is the
 * *index* as a fraction of the highest index, so step 4 of 6 showed as 67 %;
 * and the steps are not evenly spaced anyway -- the device tree declares
 * `cooling-levels = <0 16 32 64 102 170 254>`, so step 4 is a PWM duty of
 * 102/254, about 40 %. The screen agreed with neither the index nor the duty,
 * and a continuous-looking readout invited the reader to believe a fan with
 * seven positions could sit anywhere between them.
 *
 * One filled segment per step, and the step in words beside it. That stays the
 * primary reading, because it is the honest one: the fan has seven positions
 * and this is which of them it is in.
 *
 * The duty cycle now sits under it, quieter, and it is a measurement rather
 * than an assumption. `type=thermal` reports the board's own `cooling-levels`
 * table, so the percentage is computed from the numbers the board sent -- the
 * objection that kept it off this card was that no endpoint reported the
 * table, and that objection has been answered. When a board reports no table
 * the step stands alone; a duty is never computed from a guessed one.
 */
function StepBar({
  value,
  max,
  label,
  valueText,
}: {
  value: number;
  max: number;
  label: string;
  valueText?: string;
}) {
  return (
    <div
      className="flex w-full items-center gap-1"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      {Array.from({ length: max }, (_, index) => index + 1).map((step) => (
        <div
          key={step}
          className={cn(
            "h-2 flex-1 rounded-xs",
            step <= value
              ? "bg-neutral-900 dark:bg-neutral-100"
              : "bg-neutral-100 dark:bg-neutral-800"
          )}
        />
      ))}
    </div>
  );
}

/**
 * One sensor's reading.
 *
 * `present` is checked before the number is touched, and so is
 * `Number.isFinite`: a daemon that sends null, a string or nothing at all for
 * a sensor it could not read must not produce `0.0 °C` or `NaN °C` on a page
 * whose whole purpose is to say whether the board is hot. Unreadable is a
 * state with its own words.
 */
function SensorReading({ sensor }: { sensor: ThermalSensor }) {
  const { t } = useTranslation();

  if (!sensor.present || !Number.isFinite(sensor.temperature_c)) {
    return (
      <span className="font-semibold text-amber-600 dark:text-amber-500">
        {t("info.thermalAbsent")}
      </span>
    );
  }

  return (
    <span className="font-semibold">
      {t("info.thermalCelsius", { value: sensor.temperature_c.toFixed(1) })}
    </span>
  );
}

function ThermalSkeleton() {
  return (
    <div className="flex flex-row py-1">
      <div className="w-1/2 lg:w-1/4">
        <div className="h-6 w-28 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
      </div>
      <div className="h-6 w-20 animate-pulse bg-neutral-200 dark:bg-neutral-700"></div>
    </div>
  );
}

/**
 * Fan Control, with the temperature that drives it.
 *
 * Until this week the board could not measure its own temperature -- the SoC
 * thermal sensor was missing from every device tree -- so the fan ran flat
 * out and this card showed a percentage with nothing behind it. The sensor
 * and a fan curve exist now, the kernel regulates the fan, and the SoC reads
 * around 52 °C. This is where a reader looks for that number, because the fan
 * is the thing it drives.
 *
 * Three things are shown together and none of them is redundant:
 *
 * - **the temperature**, per sensor, or a line saying it cannot be measured;
 * - **the fan's step**, as segments and as "4 of 6", read from the polled
 *   `type=thermal` response -- what the fan is doing -- with the PWM duty
 *   that step commands underneath it, computed from the board's own
 *   cooling-levels table now that the daemon reports one;
 * - **the slider**, unchanged as a control and still uncontrolled, so its
 *   thumb stays where it was put -- what was asked for.
 *
 * When those last two disagree the reader is watching the governor take the
 * fan back, which is the truth about this machine and used to be invisible.
 */
export default function FanControl() {
  const { t } = useTranslation();
  const { data: coolingDevices } = useCoolingDevicesQuery();
  const {
    data: thermal,
    isPending,
    isError,
    dataUpdatedAt,
  } = useThermalQuery();
  const { mutate: mutateCoolingDevices } = useCoolingDeviceMutation();

  const [requested, setRequested] = useState(() =>
    coolingDevices.reduce(
      (acc, device) => {
        acc[device.device] = device.speed;
        return acc;
      },
      {} as Record<string, number>
    )
  );

  // The last setting committed from this page, per device, with the moment it
  // was sent. Compared against a *later* poll it is the only evidence the
  // interface can offer that the governor undid it, as opposed to a guess
  // about what the firmware might be doing.
  const [committed, setCommitted] = useState<
    Record<string, { step: number; at: number }>
  >({});

  const live = new Map((thermal?.cooling ?? []).map((fan) => [fan.name, fan]));

  const rows: FanRow[] = coolingDevices.map((device) => {
    const reported = live.get(device.device);
    return {
      name: device.device,
      max: device.max_speed,
      live: reported?.present ? reported.cur_state : null,
      setpoint: device.speed,
      controllable: true,
      present: reported ? reported.present : true,
      // Only `type=thermal` carries the levels table. A fan `type=cooling`
      // knows and `type=thermal` does not therefore shows a step and no duty,
      // which is correct: nothing here has the table for it.
      levels: reported?.levels ?? null,
      maxLevel: reported?.max_level ?? null,
    };
  });

  // A fan the thermal endpoint knows and `type=cooling` does not still gets a
  // row. There is nothing to set on it, but leaving it out would hide a
  // running fan behind an endpoint mismatch.
  for (const fan of thermal?.cooling ?? []) {
    if (!rows.some((row) => row.name === fan.name)) {
      rows.push({
        name: fan.name,
        max: fan.max_state,
        live: fan.present ? fan.cur_state : null,
        setpoint: null,
        controllable: false,
        present: fan.present,
        levels: fan.levels,
        maxLevel: fan.max_level,
      });
    }
  }

  const sensors = thermal?.sensors ?? [];
  const measuring = sensors.some(
    (sensor) => sensor.present && Number.isFinite(sensor.temperature_c)
  );

  // "The kernel is driving this" is an inference, not a reading: a sensor the
  // board can read and a cooling device the thermal layer knows are what a
  // governor needs, but whether the device tree actually maps one to the
  // other is not something any endpoint reports. It is labelled as a standing
  // condition, and the notice below is the part that is measured.
  const governed = measuring && rows.some((row) => row.live !== null);

  // A commit is reverted when a poll that finished *after* it disagrees with
  // it. dataUpdatedAt is the timestamp of the last successful thermal fetch,
  // so this needs no timer and cannot fire on the read-back that still shows
  // the new value.
  const showGovernorNote = governed && rows.some((row) => row.controllable);
  // The provenance note earns its space only where a duty is actually drawn.
  const showDutyNote = rows.some((row) => row.levels !== null);

  const reverted = rows.filter((row) => {
    const sent = committed[row.name];
    return (
      sent !== undefined &&
      row.live !== null &&
      dataUpdatedAt > sent.at &&
      row.live !== sent.step
    );
  });

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="text-lg font-bold">{t("info.fanControl")}</span>
        {governed && (
          <span className="text-sm font-semibold lowercase opacity-60">
            {t("info.fanAutomatic")}
          </span>
        )}
      </div>

      <div className="mb-6">
        {isPending && <ThermalSkeleton />}

        {isError && (
          <p className="text-sm opacity-60">{t("info.thermalUnavailable")}</p>
        )}

        {thermal && sensors.length === 0 && (
          <p className="text-sm opacity-60">{t("info.thermalNoSensors")}</p>
        )}

        {sensors.length > 0 && (
          <dl>
            {sensors.map((sensor) => (
              <TableItem key={sensor.name} term={sensor.name}>
                <SensorReading sensor={sensor} />
              </TableItem>
            ))}
          </dl>
        )}
      </div>

      <div className="space-y-6">
        {rows.map((row) => {
          // The step being drawn, and the duty of that same step -- not of the
          // setpoint and not of anything else, so the two numbers beside each
          // other always describe one position of one fan.
          const step = row.live ?? row.setpoint ?? 0;
          const duty = fanDutyPercent(row.levels, row.maxLevel, step);
          const stepLabel = t("info.fanStep", { cur: step, max: row.max });

          return (
            <div key={row.name} className="flex items-start justify-between">
              <div className="w-1/4 font-semibold">{row.name}</div>
              <div className="w-2/4 lg:w-3/4">
                <div className="flex items-center gap-4">
                  {row.present && row.max > 0 ? (
                    <>
                      <StepBar
                        value={step}
                        max={row.max}
                        label={t("info.ariaFanStep", { device: row.name })}
                        valueText={
                          duty === null
                            ? stepLabel
                            : `${stepLabel} · ${t("info.fanDuty", { value: duty })}`
                        }
                      />
                      <div className="w-20 shrink-0 text-right">
                        <div className="font-semibold">{stepLabel}</div>
                        {duty !== null && (
                          <div className="text-sm opacity-60">
                            {t("info.fanDuty", { value: duty })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="font-semibold text-amber-600 dark:text-amber-500">
                      {t("info.thermalAbsent")}
                    </span>
                  )}
                </div>

                {row.controllable && (
                  <div className="mt-4 flex items-center gap-4">
                    <Slider
                      defaultValue={[row.setpoint ?? 0]}
                      min={0}
                      max={row.max}
                      onValueChange={(value) =>
                        setRequested((previous) => ({
                          ...previous,
                          [row.name]: value[0],
                        }))
                      }
                      onValueCommit={(value) => {
                        setCommitted((previous) => ({
                          ...previous,
                          [row.name]: { step: value[0], at: Date.now() },
                        }));
                        mutateCoolingDevices({
                          device: row.name,
                          speed: value[0],
                        });
                      }}
                    />
                    <span className="w-20 shrink-0 text-right text-sm opacity-60">
                      {t("info.fanRequested", {
                        value: requested[row.name] ?? row.setpoint ?? 0,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(showGovernorNote || showDutyNote) && (
        <div className="mt-6 space-y-2 text-sm opacity-60">
          {showGovernorNote && <p>{t("info.fanGovernorNote")}</p>}
          {showDutyNote && <p>{t("info.fanDutyNote")}</p>}
        </div>
      )}

      {reverted.length > 0 && (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-amber-500 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm">
            {reverted.map((row) => (
              <p key={row.name}>
                {t("info.fanReverted", {
                  device: row.name,
                  cur: row.live,
                  max: row.max,
                  requested: committed[row.name].step,
                })}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
