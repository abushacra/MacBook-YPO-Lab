import "server-only";

import { db } from "@/lib/supabase";
import { asHoursType, type HoursType } from "@/lib/constants";

/**
 * The service call report: every call in a date range, totalled by the person
 * who logged it and subtotalled by property underneath them.
 *
 * Unlike a pay run this counts everything in range, approved or not, because it
 * is a record of work done rather than an instruction to pay. What is still
 * awaiting approval is counted separately so a total is never mistaken for a
 * signed-off one.
 *
 * A call covering two properties counts as two service calls, one under each
 * property — that is the number of buildings actually attended. The money does
 * not follow: a call carries one amount, and there is no rule for dividing it
 * between two buildings, so it stays whole on the first property. A second
 * property therefore adds to the counts and nothing to the money, and
 * `loggedCount` is kept alongside for reconciling against the calls table.
 */

export type ReportPropertyRow = {
  propertyId: string;
  propertyName: string;
  callCount: number;
  amount: number;
  /** Calls with no amount yet — an engineer with no rate, or a vendor who left it blank. */
  unpricedCount: number;
};

export type ReportPersonRow = {
  technicianId: string;
  name: string;
  kind: string;
  /** Properties attended: one per call, plus one more for each second property. */
  callCount: number;
  /** Rows in the calls table, whatever number of properties each covered. */
  loggedCount: number;
  amount: number;
  unpricedCount: number;
  pendingCount: number;
  /** Calls that also covered a second property, and so count twice above. */
  secondPropertyCount: number;
  byCharge: Record<HoursType, number>;
  properties: ReportPropertyRow[];
};

export type ServiceCallReport = {
  from: string;
  to: string;
  people: ReportPersonRow[];
  /** The headline total: properties attended, second properties included. */
  callCount: number;
  loggedCount: number;
  amount: number;
  unpricedCount: number;
  pendingCount: number;
  secondPropertyCount: number;
};

export type ReportCall = {
  technician_id: string;
  property_id: string;
  property_label: string;
  property_id_2: string | null;
  property_label_2: string | null;
  hours_type: string;
  billed_amount: number | null;
  approval_status: string;
};

export async function buildReport(from: string, to: string): Promise<ServiceCallReport> {
  const [{ data: calls }, { data: technicians }, { data: properties }] = await Promise.all([
    db()
      .from("service_calls")
      .select(
        "technician_id, property_id, property_label, property_id_2, property_label_2, hours_type, billed_amount, approval_status",
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
        loggedCount: 0,
        amount: 0,
        unpricedCount: 0,
        pendingCount: 0,
        secondPropertyCount: 0,
        byCharge: { regular: 0, after_hours: 0, double_time: 0 },
        properties: [],
        byProperty: new Map(),
      };
      people.set(call.technician_id, person);
    }

    const charge = asHoursType(call.hours_type);
    const amount = call.billed_amount ?? 0;

    /**
     * One attendance at one property. A call covering two properties produces
     * two of these, so the totals read as buildings attended.
     */
    const attend = (propertyId: string, label: string, carriesAmount: boolean) => {
      let row = person.byProperty.get(propertyId);
      if (row === undefined) {
        row = {
          propertyId,
          // The live name, falling back to the label stored on the call if the
          // property has since been deleted.
          propertyName: propertyNameById.get(propertyId) ?? label,
          callCount: 0,
          amount: 0,
          unpricedCount: 0,
        };
        person.byProperty.set(propertyId, row);
      }

      row.callCount += 1;
      person.callCount += 1;
      person.byCharge[charge] += 1;

      /*
       * The amount rides on the first property only. A call has one amount and
       * no rule for splitting it, so halving it here would invent a number, and
       * putting it on both would double the money. An unpriced call is likewise
       * one call nobody is paid for, counted once.
       */
      if (!carriesAmount) return;
      row.amount = Math.round((row.amount + amount) * 100) / 100;
      person.amount = Math.round((person.amount + amount) * 100) / 100;
      if (call.billed_amount === null) {
        row.unpricedCount += 1;
        person.unpricedCount += 1;
      }
    };

    attend(call.property_id, call.property_label, true);
    if (call.property_id_2 !== null) {
      attend(call.property_id_2, call.property_label_2 ?? "Second property", false);
      person.secondPropertyCount += 1;
    }

    // Counted per row in the calls table, not per property attended: one call
    // is one record and one approval however many buildings it covered.
    person.loggedCount += 1;
    if (call.approval_status === "pending") person.pendingCount += 1;
  }

  const rows = [...people.values()]
    .map(({ byProperty, ...person }) => ({
      ...person,
      properties: [...byProperty.values()].sort(
        (a, b) => b.callCount - a.callCount || a.propertyName.localeCompare(b.propertyName),
      ),
    }))
    .sort((a, b) => b.callCount - a.callCount || a.name.localeCompare(b.name));

  const sum = (pick: (person: ReportPersonRow) => number) =>
    rows.reduce((total, person) => total + pick(person), 0);

  return {
    from,
    to,
    people: rows,
    callCount: sum((person) => person.callCount),
    loggedCount: sum((person) => person.loggedCount),
    amount: Math.round(sum((person) => person.amount) * 100) / 100,
    unpricedCount: sum((person) => person.unpricedCount),
    pendingCount: sum((person) => person.pendingCount),
    secondPropertyCount: sum((person) => person.secondPropertyCount),
  };
}
