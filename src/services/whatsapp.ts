import * as Linking from "expo-linking";
import { apiRequest } from "./api";

export type WhatsAppTemplate = {
  id: number;
  owner?: number | null;
  title: string;
  message: string;
};

export type WhatsAppInitiateResult = {
  status: string;
  activity_id: number;
  lead_id: number;
  lead_name: string;
  phone: string;
  message: string;
  deep_link: string;
  web_link: string;
  template_name: string;
  source: string;
};

export function listWhatsAppTemplates(token: string): Promise<WhatsAppTemplate[]> {
  return apiRequest<WhatsAppTemplate[]>("/mobile/whatsapp/templates/", { token });
}

export function normalizeWhatsAppPhone(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // 10 digits Indian mobile number
  if (digits.length === 10) {
    return `91${digits}`;
  }
  // 11 digits starting with 0
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  // 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return digits;
}

export async function initiateWhatsApp(
  token: string,
  leadId: string | number,
  payload: { template_id?: number | null; message?: string; source?: string }
): Promise<WhatsAppInitiateResult> {
  return apiRequest<WhatsAppInitiateResult>(`/mobile/leads/${leadId}/whatsapp/initiate/`, {
    token,
    method: "POST",
    body: {
      template_id: payload.template_id ?? null,
      message: payload.message ?? "",
      source: payload.source || "CALLER",
    },
  });
}

/**
 * Attempts to launch WhatsApp with recipient phone and prefilled message.
 * Falls back to universal wa.me web link if native WhatsApp is unavailable.
 * Returns true if opened successfully, false otherwise.
 */
export async function launchWhatsAppHandoff(
  phone: string,
  message: string
): Promise<{ success: boolean; fallbackUsed: boolean; error?: string }> {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { success: false, fallbackUsed: false, error: "Invalid phone number format." };
  }

  const encodedText = encodeURIComponent(message || "");
  const nativeUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedText}`;
  const webUrl = `https://wa.me/${normalizedPhone}?text=${encodedText}`;

  try {
    const canOpenNative = await Linking.canOpenURL(nativeUrl);
    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
      return { success: true, fallbackUsed: false };
    }
  } catch {
    // Native scheme check failed, try universal web link
  }

  try {
    await Linking.openURL(webUrl);
    return { success: true, fallbackUsed: true };
  } catch (err) {
    return {
      success: false,
      fallbackUsed: true,
      error: "WhatsApp is not installed on this device and web browser could not be opened.",
    };
  }
}

export function saveWhatsAppTemplate(token: string, data: { title: string; message: string }, id?: number) {
  return apiRequest<WhatsAppTemplate>(`/mobile/whatsapp/templates/${id ? `${id}/` : ''}`, {
    token, method: id ? 'PATCH' : 'POST', body: data,
  });
}
export function deleteWhatsAppTemplate(token: string, id: number) {
  return apiRequest<void>(`/mobile/whatsapp/templates/${id}/`, { token, method: 'DELETE' });
}
