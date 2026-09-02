export type PaymentQrData = {
  accountNumber: string;
  bankCode: 'TIMI';
  amount?: number;
  note?: string;
  accountName?: string;
};

const PREFIX = 'TIMI--PAYMENT:1:';
const MAX_QR_LENGTH = 2048;

function toBase64Url(value: string) {
  const binary = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) => (
    String.fromCharCode(Number.parseInt(hex, 16))
  ));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    const encoded = Array.from(binary, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function createPaymentQr(input: PaymentQrData) {
  const accountNumber = input.accountNumber.replace(/\D/g, '');
  const note = input.note?.trim();
  const accountName = input.accountName?.trim();
  if (!/^\d{10}$/.test(accountNumber)) return null;
  if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 10_000_000_000)) return null;
  if (note && note.length > 500) return null;

  const payload = `${PREFIX}${toBase64Url(JSON.stringify({
    version: 1,
    accountNumber,
    bankCode: 'TIMI',
    ...(input.amount ? { amount: input.amount } : {}),
    ...(note ? { note } : {}),
    ...(accountName ? { accountName } : {}),
  }))}`;
  return payload.length <= MAX_QR_LENGTH ? payload : null;
}

export function parsePaymentQr(rawValue: string): PaymentQrData | null {
  const raw = rawValue.trim();
  if (!raw.startsWith(PREFIX) || raw.length > MAX_QR_LENGTH) return null;
  const decoded = fromBase64Url(raw.slice(PREFIX.length));
  if (!decoded) return null;
  try {
    const value = JSON.parse(decoded) as Partial<PaymentQrData> & { version?: number };
    if (value.version !== 1 || value.bankCode !== 'TIMI' || typeof value.accountNumber !== 'string' || !/^\d{10}$/.test(value.accountNumber)) return null;
    if (value.amount !== undefined && (!Number.isSafeInteger(value.amount) || value.amount <= 0 || value.amount > 10_000_000_000)) return null;
    if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 500)) return null;
    return {
      accountNumber: value.accountNumber,
      bankCode: 'TIMI',
      ...(value.amount ? { amount: value.amount } : {}),
      ...(value.note ? { note: value.note } : {}),
      ...(value.accountName ? { accountName: value.accountName } : {}),
    };
  } catch {
    return null;
  }
}
