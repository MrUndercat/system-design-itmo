import axios from "axios";
import { config } from "../config";

const rentAxios = axios.create({
  baseURL: config.rentManagerUrl,
  validateStatus: () => true,
});

export type VisibleDeal = {
  id: string;
  listing_id: string;
  landlord_id: string;
  tenant_id: string;
  status: string;
};

export async function assertListingExists(listingId: string): Promise<boolean> {
  const r = await rentAxios.get(`/listings/${listingId}`);
  return r.status === 200;
}

export async function listVisibleDeals(bearerAuthHeader: string): Promise<VisibleDeal[]> {
  const r = await rentAxios.get("/deals", {
    headers: { Authorization: bearerAuthHeader },
  });
  if (r.status !== 200 || !Array.isArray(r.data?.data)) {
    return [];
  }
  return r.data.data as VisibleDeal[];
}

export async function assertDealVisible(dealId: string, bearerAuthHeader: string): Promise<boolean> {
  const deals = await listVisibleDeals(bearerAuthHeader);
  return deals.some((deal) => deal.id === dealId);
}
