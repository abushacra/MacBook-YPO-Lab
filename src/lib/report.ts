import "server-only";

import { db } from "@/lib/supabase";
import { asHoursType, type HoursType } from "@/lib/constants";
import { formatLocation } from "@/lib/format";
import { HOURS_TYPE_MULTIPLIERS } from "@/lib/rates";

/**
 * The service call report: every call in a date range, totalled by the person
 * who logged it and subtotalled by property underneath them.
 *
 * Unlike a pay run this counts everything in range, approved or not, because it
 * is a record of work done rather than an instruction to pay. What is still
 * awaiting approval is counted separately so a total is never mistaken for a
 * signed-off one.
 *
 * A call counts as its Service Call Charge rather than as one row: Regular is
 * one service call, x 1.5 is one and a half, x 2 is two. That is the same
 * multiplier the call was priced at, so the totals read as work done rather than
 * as forms filled in — thirteen calls including four at x 1.5 and one at x 2
 * come to sixteen service calls.
 */

export type ReportPropertyRow = {
  propertyId: string;
  propertyName: string;
  /** Weighted by Service Call Charge, so a x 1.5 call counts as 1.5. */
  callCount: number;
  amount: number;
  /** Calls with no amount yet — an engineer with no rate, or a vendor who left it blank. */
  unpricedCount: number;
};

/** One service call, as it appears in the detail list under its engineer. */
export type ReportCallRow = {
  date: string;
  property: string;
  secondProperty: string | null;
  hoursType: HoursType;
  /** What this one call counts as: 1, 1.5 or 2, by its Service Call Charge. */
  weight: number;
  callType: string;
  approvalStatus: string;
  followUpNeeded: boolean;
  description: string | null;
  amount: number | null;
};

export type ReportPersonRow = {
  technicianId: string;
  name: string;
  kind: string;
  callCount: number;
  amount: number;
  unpricedCount: number;
  pendingCount: number;
  /** Calls that also covered a second property, counted here on the first only. */
  secondPropertyCount: number;
  properties: ReportPropertyRow[];
  /** Every call this person logged in the range, oldest first. */
  calls: ReportCallRow[];
};

/** One engineer's share of a property, in the by-property view. */
export type ReportPropertyEngineer = {
  technicianId: string;
  name: string;
  kind: string;
  callCount: number;
  amount: number;
  unpricedCount: number;
};

/**
 * A property with the engineers who attended it underneath — the by-engineer
 * view turned on its head, for charging a property's customer and seeing who
 * did the work there.
 */
export type ReportPropertyGroup = {
  propertyId: string;
  propertyName: string;
  callCount: number;
  amount: number;
  unpricedCount: number;
  engineers: ReportPropertyEngineer[];
};

export type ServiceCallReport = {
  from: string;
  to: string;
  people: ReportPersonRow[];
  /** The same work grouped the other way: property first, engineers under it. */
  properties: ReportPropertyGroup[];
  callCount: number;
  amount: number;
  unpricedCount: number;
  pendingCount: number;
  secondPropertyCount: number;
};

export type ReportCall = {
  technician_id: string;
  call_date: string;
  property_id: string;
  property_label: string;
  space_label: string | null;
  property_id_2: string | null;
  property_label_2: string | null;
  space_label_2: string | null;
  hours_type: string;
  call_type: string;
  approval_status: string;
  follow_up_needed: boolean;
  description: string | null;
  billed_amount: number | null;
};

export async function buildReport(from: string, to: string): Promise<ServiceCallReport> {
  const [{ data: calls }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("service_calls")
      .select(
        "technician_id, call_date, property_id, property_label, space_label, property_id_2, property_label_2, space_label_2, hours_type, call_type, approval_status, follow_up_needed, description, billed_amount",
      )
      .gte("call_date", from)
      .lte("call_date", to),
    db().from("technicians").select("id, name, kind"),
    db().from("properties").select("id, name"),
  ]);

  return groupReport(from, to, calls ?? [], technicians ?? [], properties ?? []);
}

/** The grouping, kept free of the database so the totals can be tested directly. */
export function groupReport(
  from: string,
  to: string,
  calls: ReportCall[],
  technicians: { id: string; name: string; kind: string }[],
  properties: { id: string; name: string }[],
): ServiceCallReport {
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const propertyNameById = new Map(properties.map((row) => [row.id, row.name]));

  const people = new Map<string, ReportPersonRow & { byProperty: Map<string, ReportPropertyRow> }>();

  for (const call of calls) {
    let person = people.get(call.technician_id);
    if (person === undefined) {
      const technician = technicianById.get(call.technician_id);
      person = {
        technicianId: call.technician_id,
        name: technician?.name ?? "Unknown",
        kind: technician?.kind ?? "in_house",
        callCount: 0,
        amount: 0,
        unpricedCount: 0,
        pendingCount: 0,
        secondPropertyCount: 0,
        properties: [],
        calls: [],
        byProperty: new Map(),
      };
      people.set(call.technician_id, person);
    }

    /*
     * A call covering two properties is counted once, on the first — the same
     * choice the pay run makes. Splitting it would need a rule for how to divide
     * one call between two buildings, and there isn't one. Counting it twice
     * would stop the property subtotals adding up to the person's total, which
     * is the whole point of the report.
     */
    let row = person.byProperty.get(call.property_id);
    if (row === undefined) {
      row = {
        propertyId: call.property_id,
        // The live name, falling back to the label stored on the call if the
        // property has since been deleted.
        propertyName: propertyNameById.get(call.property_id) ?? call.property_label,
        callCount: 0,
        amount: 0,
        unpricedCount: 0,
      };
      person.byProperty.set(call.property_id, row);
    }

    const amount = call.billed_amount ?? 0;

    /*
     * What this call counts as. A x 1.5 call is a call and a half and a x 2 is
     * two, the same multiple it was priced at, so the service call totals track
     * the work rather than the number of rows. Weights are halves, which are
     * exact in binary floating point, but the sums are rounded anyway so a long
     * column can never drift.
     */
    const weight = HOURS_TYPE_MULTIPLIERS[asHoursType(call.hours_type)];

    row.callCount = Math.round((row.callCount + weight) * 100) / 100;
    row.amount = Math.round((row.amount + amount) * 100) / 100;
    if (call.billed_amount === null) row.unpricedCount += 1;

    person.callCount = Math.round((person.callCount + weight) * 100) / 100;
    person.amount = Math.round((person.amount + amount) * 100) / 100;
    if (call.billed_amount === null) person.unpricedCount += 1;
    if (call.approval_status === "pending") person.pendingCount += 1;
    if (call.property_id_2 !== null) person.secondPropertyCount += 1;

    // The detail list: the call itself, for the day-by-day view under the
    // summary. Labels are resolved here so the screen and the spreadsheet read
    // the same thing.
    person.calls.push({
      date: call.call_date,
      property: formatLocation(call.property_label, call.space_label),
      secondProperty: call.property_label_2
        ? formatLocation(call.property_label_2, call.space_label_2)
        : null,
      hoursType: asHoursType(call.hours_type),
      weight,
      callType: call.call_type,
      approvalStatus: call.approval_status,
      followUpNeeded: call.follow_up_needed,
      description: call.description,
      amount: call.billed_amount,
    });
  }

  const rows = [...people.values()]
    .map(({ byProperty, ...person }) => ({
      ...person,
      properties: [...byProperty.values()].sort(
        (a, b) => b.callCount - a.callCount || a.propertyName.localeCompare(b.propertyName),
      ),
      // Oldest first, which is the order a timesheet reads in.
      calls: [...person.calls].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));

  const sum = (pick: (person: ReportPersonRow) => number) =>
    rows.reduce((total, person) => total + pick(person), 0);

  return {
    from,
    to,
    people: rows,
    properties: byProperty(rows),
    callCount: Math.round(sum((person) => person.callCount) * 100) / 100,
    amount: Math.round(sum((person) => person.amount) * 100) / 100,
    unpricedCount: sum((person) => person.unpricedCount),
    pendingCount: sum((person) => person.pendingCount),
    secondPropertyCount: sum((person) => person.secondPropertyCount),
  };
}

/**
 * Turns the by-engineer rows into by-property groups.
 *
 * Built from the same rows the other view shows rather than walking the calls
 * again, so the two can never disagree: every figure here is a figure from
 * there, added up in a different order.
 */
function byProperty(people: ReportPersonRow[]): ReportPropertyGroup[] {
  const groups = new Map<string, ReportPropertyGroup>();

  for (const person of people) {
    for (const row of person.properties) {
      let group = groups.get(row.propertyId);
      if (group === undefined) {
        group = {
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          callCount: 0,
          amount: 0,
          unpricedCount: 0,
          engineers: [],
        };
        groups.set(row.propertyId, group);
      }

      group.callCount = Math.round((group.callCount + row.callCount) * 100) / 100;
      group.amount = Math.round((group.amount + row.amount) * 100) / 100;
      group.unpricedCount += row.unpricedCount;
      group.engineers.push({
        technicianId: person.technicianId,
        name: person.name,
        kind: person.kind,
        callCount: row.callCount,
        amount: row.amount,
        unpricedCount: row.unpricedCount,
      });
    }
  }

  const byBusiest = <T extends { callCount: number }>(a: T, b: T) => b.callCount - a.callCount;

  return [...groups.values()]
    .map((group) => ({
      ...group,
      engineers: [...group.engineers].sort(
        (a, b) => byBusiest(a, b) || a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => byBusiest(a, b) || a.propertyName.localeCompare(b.propertyName));
}
