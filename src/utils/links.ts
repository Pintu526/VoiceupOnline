export function whatsAppLink(phone: string, message: string): string {
  const normalizedPhone = phone.replace(/\D/g, "");
  const baseUrl = normalizedPhone ? `https://wa.me/${normalizedPhone}` : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

export function smsLink(phone: string, message: string): string {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  return `sms:${normalizedPhone}?&body=${encodeURIComponent(message)}`;
}
