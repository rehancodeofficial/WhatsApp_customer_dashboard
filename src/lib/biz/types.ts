// Business records that replace the Google Sheets.
export type PaymentTier = 'high' | 'medium' | 'low';
export type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
export type MovementType = 'in' | 'out' | 'adjustment' | 'return';

export interface Supplier {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  brands: string[];
  rating: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  code?: string | null;
  contact_person?: string | null;
  preferred_language?: string | null;
}

export interface Product {
  id: string;
  sku: string;
  brand: string;
  model: string;
  variant: string | null;
  condition: 'new' | 'refurbished' | 'used';
  category: string;
  cost_price: number;
  sale_price: number;
  currency: string;
  stock_qty: number;
  reorder_level: number;
  supplier_id: string | null;
  location: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  storage?: string | null;
  color?: string | null;
  grade?: string | null;
  market_region?: string | null;
  reserved_qty?: number;
  notes?: string | null;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number; // signed
  unit_cost: number | null;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  item_code?: string | null;
  grade?: string | null;
}

export interface Order {
  id: string;
  order_no: string;
  contact_id: string | null;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  source: string;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  handoff_status?: string | null;
  payment_method?: string | null;
  last_email_id?: string | null;
  owner_chat_link?: string | null;
}

/** A contact as a customer record, with the fields the business modules add. */
export interface CustomerRecord {
  id: string;
  wa_id: string;
  name: string | null;
  profile_name: string | null;
  email: string | null;
  company: string | null;
  country: string | null;
  city: string | null;
  preferred_language: string | null;
  lead_status: string | null;
  tags: string[];
  notes: string | null;
  payment_tier: PaymentTier | null; // null = automatic
  preferred_brands: string[];
  marketing_opt_in: boolean;
  created_at: string;
  lead_id?: string | null;
  customer_code?: string | null;
  delivery_address?: string | null;
  payment_method?: string | null;
  last_email_id?: string | null;
  offer?: Record<string, unknown> | null;
}

export interface CustomerView extends CustomerRecord {
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
  brands_bought: string[];
  /** All brands this customer asked for or bought. */
  brands: string[];
  tier: PaymentTier; // effective tier (manual, else automatic)
  tier_auto: boolean;
  conversation_id: string | null;
  last_customer_message_at: string | null;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  product_ids: string[];
  filters: AudienceFilters;
  template_name: string | null;
  ai_suggested: boolean;
  status: 'draft' | 'sending' | 'sent' | 'partial' | 'failed';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface BroadcastRecipient {
  id: string;
  broadcast_id: string;
  contact_id: string | null;
  wa_id: string;
  name: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  wa_message_id: string | null;
  error: string | null;
  sent_at: string | null;
}

export interface AudienceFilters {
  countries?: string[];
  tiers?: PaymentTier[];
  brands?: string[];
  /** Only customers who opted in to marketing (default true). */
  optedInOnly?: boolean;
}

export interface NewOrderInput {
  contact_id: string | null;
  status?: OrderStatus;
  payment_status?: OrderPaymentStatus;
  source?: string;
  currency?: string;
  discount?: number;
  notes?: string | null;
  created_by?: string | null;
  items: { product_id: string | null; description: string; quantity: number; unit_price: number }[];
}

export interface NewMovementInput {
  product_id: string;
  type: MovementType;
  quantity: number; // signed
  unit_cost?: number | null;
  reference?: string | null;
  note?: string | null;
  created_by?: string | null;
}

// ---------------------------------------------------------------- sheet parity
export interface CustomerInquiry {
  id: string;
  contact_id: string | null;
  wa_id: string | null;
  lead_code: string | null;
  brand: string | null;
  model: string | null;
  storage: string | null;
  grade: string | null;
  color: string | null;
  quantity: number | null;
  quoted_price: number | null;
  status: string | null;
  created_at: string;
}

export interface SupplierRequest {
  id: string;
  request_code: string;
  request_date: string | null;
  customer_name: string | null;
  wa_id: string | null;
  email: string | null;
  customer_market: string | null;
  brand: string | null;
  model: string | null;
  storage: string | null;
  grade: string | null;
  color: string | null;
  quantity: number | null;
  status: string | null;
  notes: string | null;
  expires_at: string | null;
  selected_supplier_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuote {
  id: string;
  quote_code: string;
  request_code: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  contact_person: string | null;
  wa_id: string | null;
  location: string | null;
  brand: string | null;
  model: string | null;
  storage: string | null;
  grade: string | null;
  color: string | null;
  requested_qty: number | null;
  price_per_unit: number | null;
  currency: string | null;
  delivery_days: number | null;
  available_qty: number | null;
  supplier_reply: string | null;
  status: string | null;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierDemand {
  id: string;
  demand_code: string;
  supplier_code?: string | null;
  expected_unit_price?: number | null;
  offered_unit_price?: number | null;
  confirmed_quantity?: number | null;
  delivery_time?: string | null;
  total_cost?: number | null;
  payment_status?: string | null;
  tracking_reference?: string | null;
  product_code: string | null;
  requested_quantity: number | null;
  delivery_location: string | null;
  demand_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  wa_id: string | null;
  party: 'customer' | 'supplier' | null;
  order_no: string | null;
  request_code: string | null;
  read_at: string | null;
  created_at: string;
}

export type RowTable = 'customer_inquiries' | 'supplier_requests' | 'supplier_quotes' | 'supplier_demands' | 'notifications';
