import "server-only";

import { db } from "@/lib/supabase";
import { asHoursType, type HoursType } from "@/lib/constants";
import { formatLocation } from "@/lib/format";
import { HOURS_TYPE_MULTIPLIERS } from "@/lib/rates";
import { splitCall, type CallShare } from "@/lib/split";

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
  /** The first property in play, with its space. */
  property: string;
  /**
   * How this call divides between the properties it covered — one share, or
   * two halves. The by-property view takes its own share from here rather than
   * walking the calls again, so the two views cannot answer differently.
   */
  shares: CallShare[];
  /** Whether this call was divided between two properties. */
  isSplit: boolean;
  hoursType: HoursType;
  /** What this call counts as here: 1, 1.5 or 2, or half that on a split. */
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
  /** Calls that covered two properties, split half to each. Counted once. */
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
  /** Every call at this property, oldest first, for the one-page-per-property view. */
  calls: (ReportCallRow & { engineerName: string })[];
};

/** Which calls the report is built from. Everything here narrows the range. */
export type ReportFilters = {
  /**
   * Paid means the call was on a pay run an admin marked billed — the same
   * `billed_at` the Service Calls screen and the next pay run go by.
   */
  paid: PaidFilter;
  /**
   * The only people this reader may see at all. A chief gets their own team;
   * null is everyone, which is what an admin gets. Not a screen the reader
   * chose — a boundary they cannot widen.
   */
  visibleTechnicianIds: string[] | null;
  /** Screen down to one person, or one property. Null means all of them. */
  technicianId: string | null;
  propertyId: string | null;
  /**
   * Whether calls marked admin-only are in scope. Admins only — these are pay
   * items the person being paid is not shown.
   */
  includeAdminOnly: boolean;
};

export const PAID_FILTERS = ["unpaid", "paid", "all"] as const;
export type PaidFilter = (typeof PAID_FILTERS)[number];

export function asPaidFilter(value: string): PaidFilter {
  return (PAID_FILTERS as readonly string[]).includes(value) ? (value as PaidFilter) : "all";
}

export const ALL_CALLS: ReportFilters = {
  paid: "all",
  visibleTechnicianIds: null,
  technicianId: null,
  propertyId: null,
  includeAdminOnly: true,
};

export type ServiceCallReport = {
  from: string;
  to: string;
  filters: ReportFilters;
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
  billed_at: string | null;
};

export async function buildReport(
  from: string,
  to: string,
  filters: ReportFilters = ALL_CALLS,
): Promise<ServiceCallReport> {
  let calls = db()
    .from("service_calls")
    .select(
      "technician_id, call_date, property_id, property_label, space_label, property_id_2, property_label_2, space_label_2, hours_type, call_type, approval_status, follow_up_needed, description, billed_amount, billed_at",
    )
    .gte("call_date", from)
    .lte("call_date", to);

  // Admin-only calls belong to no report but an admin's.
  if (!filters.includeAdminOnly) calls = calls.eq("admin_only", false);

  if (filters.paid === "unpaid") calls = calls.is("billed_at", null);
  if (filters.paid === "paid") calls = calls.not("billed_at", "is", null);

  /*
   * The visibility boundary and the chosen screen are both applied in the
   * query, so a call the reader may not see never reaches the grouping. An
   * empty allow-list means exactly that — no rows — rather than everyone.
   */
  if (filters.visibleTechnicianIds !== null) {
    calls = calls.in("technician_id", filters.visibleTechnicianIds);
  }
  if (filters.technicianId !== null) calls = calls.eq("technician_id", filters.technicianId);

  const [{ data: rows }, { data: technicians }, { data: properties }] = await Promise.all([
    calls,
    db().from("technicians").select("id, name, kind"),
    db().from("properties").select("id, name"),
  ]);

  return groupReport(from, to, rows ?? [], technicians ?? [], properties ?? [], filters);
}

/** The grouping, kept free of the database so the totals can be tested directly. */
export function groupReport(
  from: string,
  to: string,
  calls: ReportCall[],
  technicians: { id: string; name: string; kind: string }[],
  properties: { id: string; name: string }[],
  filters: ReportFilters = ALL_CALLS,
): ServiceCallReport {
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const propertyNameById = new Map(properties.map((row) => [row.id, row.name]));

  const people = new Map<string, ReportPersonRow & { byProperty: Map<string, ReportPropertyRow> }>();

  /*
   * A property screen matches either property a call named, because a call
   * that covered two now counts half at each — the screened property really is
   * one of its properties, not a footnote. Only that property's half is kept,
   * which the share filter below takes care of.
   */
  for (const call of calls) {
    if (
      filters.propertyId !== null &&
      call.property_id !== filters.propertyId &&
      call.property_id_2 !== filters.propertyId
    ) {
      continue;
    }

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

    const amount = call.billed_amount ?? 0;

    /*
     * What this call counts as. A x 1.5 call is a call and a half and a x 2 is
     * two, the same multiple it was priced at, so the service call totals track
     * the work rather than the number of rows. Weights are halves, which are
     * exact in binary floating point, but the sums are rounded anyway so a long
     * column can never drift.
     */
    const weight = HOURS_TYPE_MULTIPLIERS[asHoursType(call.hours_type)];

    /*
     * A call covering two properties is divided half and half between them, by
     * the same rule the pay run uses, so a property's figure here and its line
     * on a bill always agree. Two halves are one call, so a person's property
     * subtotals still add up to their total.
     *
     * On a screened report only the screened property's half is in play, and
     * the person's total narrows to match — a report of one building shows
     * what that building owes, not what the engineer earned everywhere.
     */
    const shares = splitCall(call, weight, amount).filter(
      (share) => filters.propertyId === null || share.propertyId === filters.propertyId,
    );

    for (const share of shares) {
      let row = person.byProperty.get(share.propertyId);
      if (row === undefined) {
        row = {
          propertyId: share.propertyId,
          // The live name, falling back to the label stored on the call if the
          // property has since been deleted.
          propertyName: propertyNameById.get(share.propertyId) ?? share.propertyLabel,
          callCount: 0,
          amount: 0,
          unpricedCount: 0,
        };
        person.byProperty.set(share.propertyId, row);
      }

      row.callCount = Math.round((row.callCount + share.weight) * 100) / 100;
      row.amount = Math.round((row.amount + share.amount) * 100) / 100;
      // A call with no amount is a whole call to chase at each property it
      // touched, not half a problem.
      if (call.billed_amount === null) row.unpricedCount += 1;
    }

    const shownWeight = shares.reduce((total, share) => total + share.weight, 0);
    const shownAmount = shares.reduce((total, share) => total + share.amount, 0);

    person.callCount = Math.round((person.callCount + shownWeight) * 100) / 100;
    person.amount = Math.round((person.amount + shownAmount) * 100) / 100;
    if (call.billed_amount === null) person.unpricedCount += 1;
    if (call.approval_status === "pending") person.pendingCount += 1;
    if (shares.some((share) => share.isSplit)) person.secondPropertyCount += 1;

    /*
     * One row per call, not per share — the by-engineer day list is a list of
     * what the person did, and a call they went to once should appear once.
     * The shares ride along so the by-property view can take just its own half
     * without walking the calls a second time and risking a different answer.
     */
    person.calls.push({
      date: call.call_date,
      property: formatLocation(shares[0]?.propertyLabel ?? call.property_label, shares[0]?.spaceLabel ?? call.space_label),
      shares,
      isSplit: shares.some((share) => share.isSplit),
      hoursType: asHoursType(call.hours_type),
      weight: shownWeight,
      callType: call.call_type,
      approvalStatus: call.approval_status,
      followUpNeeded: call.follow_up_needed,
      description: call.description,
      amount: call.billed_amount === null ? null : shownAmount,
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
    filters,
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
          calls: [],
        };
        groups.set(row.propertyId, group);
      }

      /*
       * A call lands in this group carrying only this property's share: its
       * half of the count and its half of the money on a split, the whole of
       * both otherwise. The other property is not named here, because this
       * page goes to the one that is.
       */
      for (const call of person.calls) {
        const share = call.shares.find((candidate) => candidate.propertyId === row.propertyId);
        if (share === undefined) continue;

        group.calls.push({
          ...call,
          property: formatLocation(share.propertyLabel, share.spaceLabel),
          weight: share.weight,
          amount: call.amount === null ? null : share.amount,
          engineerName: person.name,
        });
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
      // Oldest first, as the by-engineer detail reads, so a property's page and
      // an engineer's page show the same call in the same order.
      calls: [...group.calls].sort(
        (a, b) => a.date.localeCompare(b.date) || a.engineerName.localeCompare(b.engineerName),
      ),
    }))
    .sort((a, b) => byBusiest(a, b) || a.propertyName.localeCompare(b.propertyName));
}
