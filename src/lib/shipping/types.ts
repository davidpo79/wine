// Carrier-agnostic shipping provider contract. CTT (E-commerce API v3) is the first implementation, mocked until
// credentials exist. Nothing in the app calls this yet: the admin still types the tracking number by hand
// (orderAction "shipped"), and shipping prices stay flat per bundle (lib/draft.ts, lib/promo.ts). There is no
// rates method on purpose: CTT prices come from the contract, not from the API.
// Pure types: no db, no env, safe to import anywhere (tests, scripts, route handlers).

export type ShippingProviderId = "ctt";

/** Countries are ISO 3166-1 alpha-2 here ("PT", as stored on orders); each provider converts to its own format. */
export type ShipmentAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  postalCode: string; // PT: "1234-567"
  city: string;
  country: string;
  phone?: string | null;
  email?: string | null;
};

export type ShipmentItem = { description: string; quantity: number; weightGrams: number; valueCents?: number | null };

export type ShipmentInput = {
  reference: string; // our order id (WP-2026-0001): the carrier's client reference
  to: ShipmentAddress;
  carrierId?: string | null; // from listCarriers(); provider default when empty
  pickupPointId?: string | null; // from listPickupPoints(); home delivery when empty
  options?: string[]; // carrier option codes (e.g. signature, insurance)
  items: ShipmentItem[];
  notes?: string | null;
};

/** Every call reports carrier warnings: the request was stored, but with caveats worth showing to the admin. */
export type WithWarnings<T> = T & { warnings: string[] };

export type LabelJob = { runId: string; callbackUrl: string | null };

export type LabelPoll =
  | { finished: number; done: false } // 0-99, still rendering
  | {
      finished: 100;
      done: true;
      labelPdfBase64: string;
      shipments: { reference: string; trackingNumber: string; trackingUrl: string }[];
    };

export type TrackingStatus = "created" | "in_transit" | "out_for_delivery" | "delivered" | "failed_attempt" | "returned" | "unknown";

export type TrackingEvent = { at: Date; code: string; status: TrackingStatus; text: string };

export type TrackingInfo = {
  trackingNumber: string;
  status: TrackingStatus; // latest event's status, "unknown" when there are none
  deliveredAt: Date | null;
  events: TrackingEvent[]; // oldest first
};

export type PickupPoint = { id: string; name: string; address: string; postalCode: string; city: string };

export type Carrier = { id: string; name: string };

export interface ShippingProvider {
  readonly id: ShippingProviderId;
  /** "mock" never leaves the process; "simulate" talks to the carrier but nothing is stored; "live" is real. */
  readonly mode: "mock" | "simulate" | "live";
  createShipment(input: ShipmentInput): Promise<WithWarnings<{ shipmentId: string }>>;
  updateShipment(shipmentId: string, input: ShipmentInput): Promise<WithWarnings<{ shipmentId: string }>>;
  /** Labels are rendered asynchronously: start a job here, then pollLabel(runId) until done. */
  createLabel(shipmentIds: string[]): Promise<WithWarnings<LabelJob>>;
  pollLabel(runId: string): Promise<WithWarnings<LabelPoll>>;
  track(trackingNumber: string): Promise<WithWarnings<TrackingInfo>>;
  listPickupPoints(q: { postalCode: string; country: string }): Promise<WithWarnings<{ points: PickupPoint[] }>>;
  listCarriers(): Promise<WithWarnings<{ carriers: Carrier[] }>>;
}
