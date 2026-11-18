export interface MetaWindowStatus {
  isOpen: boolean;
  remainingMs: number;
  remainingFormatted: string;
  expiresAt: Date | null;
}

/**
 * Calculates Meta 24-hour customer messaging window.
 * Free-form business messages are allowed only within 24 hours of the customer's last incoming message.
 * Outside this window, only pre-approved WhatsApp templates can be sent.
 */
export function get24HourWindowStatus(lastCustomerMessageAt: string | Date | null | undefined): MetaWindowStatus {
  if (!lastCustomerMessageAt) {
    return {
      isOpen: false,
      remainingMs: 0,
      remainingFormatted: 'Closed (Template required)',
      expiresAt: null,
    };
  }

  const lastMsgTime = new Date(lastCustomerMessageAt).getTime();
  if (isNaN(lastMsgTime)) {
    return {
      isOpen: false,
      remainingMs: 0,
      remainingFormatted: 'Closed',
      expiresAt: null,
    };
  }

  const windowDurationMs = 24 * 60 * 60 * 1000; // 24 hours
  const expiresAtMs = lastMsgTime + windowDurationMs;
  const nowMs = Date.now();
  const remainingMs = expiresAtMs - nowMs;

  if (remainingMs <= 0) {
    return {
      isOpen: false,
      remainingMs: 0,
      remainingFormatted: 'Window closed (Template required)',
      expiresAt: new Date(expiresAtMs),
    };
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    isOpen: true,
    remainingMs,
    remainingFormatted: `${hours}h ${minutes}m left`,
    expiresAt: new Date(expiresAtMs),
  };
}

/**
 * Maps Meta WhatsApp API error codes into friendly user explanations.
 */
export function formatMetaError(errorCode: string | number | null | undefined, defaultMessage?: string | null): string {
  if (!errorCode) return defaultMessage || 'Unknown error';

  const codeStr = String(errorCode);
  switch (codeStr) {
    case '131047':
      return '24-hour window expired (Code 131047). Free text blocked by Meta. Send an approved template to re-engage.';
    case '131026':
      return 'Customer message undeliverable. The phone number might not be registered on WhatsApp.';
    case '131042':
      return 'Payment issue or Meta account eligibility restriction.';
    case '130429':
      return 'Meta rate limit hit. Too many messages sent in a short interval.';
    case '100':
      return 'Invalid parameter sent to Meta Graph API.';
    case '190':
      return 'WhatsApp Access Token expired or invalid. Please refresh in system settings.';
    default:
      return defaultMessage ? `Meta Error ${codeStr}: ${defaultMessage}` : `Meta Error code: ${codeStr}`;
  }
}

/**
 * Send WhatsApp message via official Meta WhatsApp Cloud API.
 */
export async function sendMetaWhatsAppMessage({
  to,
  type,
  text,
  templateName,
  templateLanguage = 'en',
  mediaUrl,
}: {
  to: string; // recipient phone e.164 without '+'
  type: 'text' | 'template' | 'image' | 'document' | 'audio';
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  mediaUrl?: string;
}): Promise<{ waMessageId: string; rawResponse: any }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';

  if (!phoneNumberId || !accessToken) {
    throw new Error('Meta WhatsApp Cloud API credentials missing (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN)');
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  let payload: Record<string, any> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type,
  };

  if (type === 'text') {
    if (!text) throw new Error('Text message body is required');
    payload.text = { preview_url: false, body: text };
  } else if (type === 'template') {
    if (!templateName) throw new Error('Template name is required');
    payload.template = {
      name: templateName,
      language: { code: templateLanguage },
    };
  } else if (type === 'image') {
    payload.image = { link: mediaUrl, caption: text };
  } else if (type === 'document') {
    payload.document = { link: mediaUrl, caption: text };
  } else if (type === 'audio') {
    payload.audio = { link: mediaUrl };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorDetails = data?.error?.error_data?.details || data?.error?.message || 'Meta API error';
    const errorCode = data?.error?.code;
    const friendly = formatMetaError(errorCode, errorDetails);
    const err = new Error(friendly);
    (err as any).code = errorCode;
    (err as any).raw = data;
    throw err;
  }

  const waMessageId = data.messages?.[0]?.id || `wamid.synth_${Date.now()}`;
  return { waMessageId, rawResponse: data };
}
