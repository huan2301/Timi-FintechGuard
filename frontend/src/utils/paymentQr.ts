export type PaymentQrData = {
  accountNumber: string;
  bankCode: string;
  bankName?: string;
  amount?: number;
  note?: string;
  accountName?: string;
};

export type LinkRiskLevel = "safe" | "caution" | "danger";

export type LinkRiskSignal = {
  code: string;
  message: string;
  weight: number;
};

export type DecodedQrContent =
  | { kind: "payment"; rawValue: string; payment: PaymentQrData }
  | {
      kind: "url";
      rawValue: string;
      normalizedUrl: string | null;
      hostname: string | null;
      riskLevel: LinkRiskLevel;
      riskScore: number;
      signals: LinkRiskSignal[];
    }
  | { kind: "wifi" | "contact" | "phone" | "email" | "sms" | "text"; rawValue: string };

type BankDefinition = {
  code: string;
  name: string;
};

export const paymentBanks: BankDefinition[] = [
  { code: "ABB", name: "ABBank" },
  { code: "ACB", name: "ACB" },
  { code: "AGRIBANK", name: "Agribank" },
  { code: "BAB", name: "Bac A Bank" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "BVB", name: "BaoViet Bank" },
  { code: "CAKE", name: "Cake by VPBank" },
  { code: "CIMB", name: "CIMB Vietnam" },
  { code: "CTG", name: "VietinBank" },
  { code: "EIB", name: "Eximbank" },
  { code: "GPB", name: "GPBank" },
  { code: "HDB", name: "HDBank" },
  { code: "HSBC", name: "HSBC Vietnam" },
  { code: "IVB", name: "Indovina Bank" },
  { code: "KBANK", name: "Kasikornbank" },
  { code: "KLB", name: "KienlongBank" },
  { code: "LPB", name: "LPBank" },
  { code: "MBB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "NAB", name: "Nam A Bank" },
  { code: "OCB", name: "OCB" },
  { code: "PGB", name: "PGBank" },
  { code: "PVCB", name: "PVcomBank" },
  { code: "SCB", name: "SCB" },
  { code: "SCVN", name: "Standard Chartered Vietnam" },
  { code: "SEAB", name: "SeABank" },
  { code: "SGB", name: "Saigonbank" },
  { code: "SHB", name: "SHB" },
  { code: "SHINHAN", name: "Shinhan Bank" },
  { code: "STB", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TIMO", name: "Timo" },
  { code: "TIMI", name: "Timi Bank" },
  { code: "TPB", name: "TPBank" },
  { code: "UBANK", name: "Ubank by VPBank" },
  { code: "UOB", name: "UOB Vietnam" },
  { code: "VAB", name: "Viet A Bank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "WOORI", name: "Woori Bank Vietnam" },
];

const PREFIX = "TIMI--PAYMENT:1:";
const MAX_QR_LENGTH = 2048;
const MAX_GENERIC_QR_LENGTH = 4096;
const TIMI_BANK_CODE = "TIMI";

const SUSPICIOUS_TLDS = new Set([
  "click", "country", "gdn", "help", "icu", "link", "live", "monster",
  "online", "quest", "rest", "sbs", "shop", "site", "support", "top", "vip", "xyz",
]);
const URL_SHORTENERS = new Set([
  "bit.ly", "cutt.ly", "is.gd", "rebrand.ly", "shorturl.at", "tinyurl.com", "t.ly", "rb.gy",
]);

type EncodedPayment = {
  version: 1;
  accountNumber: string;
  bankCode: string;
  amount?: number;
  note?: string;
  accountName?: string;
};

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function normalizePayment(input: PaymentQrData): EncodedPayment | null {
  const accountNumber = input.accountNumber.replace(/\s+/g, "");
  const bank = paymentBanks.find((item) => item.code === input.bankCode);
  const amount = input.amount;
  const note = input.note?.trim();
  const accountName = input.accountName?.trim();

  if (!bank || !/^\d{6,19}$/.test(accountNumber)) return null;
  if (bank.code === TIMI_BANK_CODE && !/^\d{10}$/.test(accountNumber)) return null;
  if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000)) return null;
  if (note && note.length > 500) return null;
  if (accountName && accountName.length > 255) return null;

  return {
    version: 1,
    accountNumber,
    bankCode: bank.code,
    ...(amount ? { amount } : {}),
    ...(note ? { note } : {}),
    ...(accountName ? { accountName } : {}),
  };
}

/** Creates a local, non-payment QR payload for the Timi  flow. */
export function createPaymentQr(input: PaymentQrData): string | null {
  const payment = normalizePayment(input);
  if (!payment) return null;
  const payload = `${PREFIX}${toBase64Url(JSON.stringify(payment))}`;
  return payload.length <= MAX_QR_LENGTH ? payload : null;
}

/** Rejects every QR type other than the documented Timi  payment payload. */
export function parsePaymentQr(rawValue: string): PaymentQrData | null {
  const raw = rawValue.trim();
  if (!raw.startsWith(PREFIX) || raw.length > MAX_QR_LENGTH) return null;

  const decoded = fromBase64Url(raw.slice(PREFIX.length));
  if (!decoded) return null;

  try {
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<EncodedPayment>;
    if (candidate.version !== 1 || typeof candidate.accountNumber !== "string" || typeof candidate.bankCode !== "string") {
      return null;
    }

    const bank = paymentBanks.find((item) => item.code === candidate.bankCode);
    const amount = candidate.amount;
    const note = candidate.note;
    const accountName = candidate.accountName;
    if (!bank || !/^\d{6,19}$/.test(candidate.accountNumber)) return null;
    if (bank.code === TIMI_BANK_CODE && !/^\d{10}$/.test(candidate.accountNumber)) return null;
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000_000)) return null;
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) return null;
    if (accountName !== undefined && (typeof accountName !== "string" || accountName.length > 255)) return null;

    return {
      accountNumber: candidate.accountNumber,
      bankCode: bank.code,
      bankName: bank.name,
      ...(amount ? { amount } : {}),
      ...(note ? { note } : {}),
      ...(accountName ? { accountName } : {}),
    };
  } catch {
    return null;
  }
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function isSuspiciousTld(hostname: string): boolean {
  const labels = hostname.split(".");
  return labels.length > 1 && SUSPICIOUS_TLDS.has(labels[labels.length - 1] ?? "");
}

function urlRiskLevel(signals: LinkRiskSignal[]): LinkRiskLevel {
  const score = signals.reduce((total, signal) => total + signal.weight, 0);
  if (score >= 0.6 || signals.some((signal) => signal.code === "unsafe_scheme")) return "danger";
  if (score >= 0.2) return "caution";
  return "safe";
}

/**
 * Analyse a web link entirely on-device. This is a transparent first-pass
 * heuristic: it warns about obfuscation and does not claim a site is fraudulent.
 */
export function analyzeQrLink(rawValue: string): Extract<DecodedQrContent, { kind: "url" }> | null {
  const raw = rawValue.trim();
  if (!raw || raw.length > MAX_GENERIC_QR_LENGTH) return null;

  const hasWebPrefix = /^https?:\/\//i.test(raw) || /^www\./i.test(raw);
  const hasNonWebScheme = /^[a-z][a-z\d+.-]*:/i.test(raw);
  if (!hasWebPrefix && !hasNonWebScheme) return null;

  if (hasNonWebScheme && !hasWebPrefix) {
    return {
      kind: "url",
      rawValue: raw,
      normalizedUrl: null,
      hostname: null,
      riskLevel: "danger",
      riskScore: 1,
      signals: [{
        code: "unsafe_scheme",
        message: "QR dùng giao thức không phải HTTP/HTTPS nên ứng dụng sẽ không mở tự động.",
        weight: 1,
      }],
    };
  }

  try {
    const parsed = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname) return null;

    const signals: LinkRiskSignal[] = [];
    if (parsed.protocol === "http:") {
      signals.push({ code: "http", message: "Link không dùng HTTPS nên dữ liệu có thể bị can thiệp trên đường truyền.", weight: 0.25 });
    }
    if (parsed.username || parsed.password) {
      signals.push({ code: "embedded_credentials", message: "Link chứa thông tin đăng nhập ẩn trước tên miền.", weight: 0.65 });
    }
    if (hostname.includes("xn--")) {
      signals.push({ code: "punycode", message: "Tên miền dùng Punycode, có thể được dùng để giả dạng ký tự.", weight: 0.55 });
    }
    if (isIpAddress(hostname)) {
      signals.push({ code: "ip_address", message: "Link dùng địa chỉ IP thay vì tên miền quen thuộc.", weight: 0.45 });
    }
    if (URL_SHORTENERS.has(hostname)) {
      signals.push({ code: "shortened_url", message: "Link rút gọn che địa chỉ đích; hãy kiểm tra kỹ trước khi mở.", weight: 0.35 });
    }
    if (isSuspiciousTld(hostname)) {
      signals.push({ code: "uncommon_tld", message: "Tên miền cấp cao ít phổ biến trong các dịch vụ tài chính/chính thức.", weight: 0.25 });
    }
    if (hostname.length > 60 || hostname.split(".").length > 4) {
      signals.push({ code: "complex_hostname", message: "Tên miền dài hoặc có nhiều phần, dễ làm người dùng nhìn nhầm địa chỉ thật.", weight: 0.20 });
    }
    if (parsed.port && !["80", "443"].includes(parsed.port)) {
      signals.push({ code: "unusual_port", message: "Link dùng cổng mạng không thông dụng.", weight: 0.20 });
    }

    const riskScore = Math.min(1, Number(signals.reduce((total, signal) => total + signal.weight, 0).toFixed(2)));
    return {
      kind: "url",
      rawValue: raw,
      normalizedUrl: parsed.toString(),
      hostname,
      riskLevel: urlRiskLevel(signals),
      riskScore,
      signals,
    };
  } catch {
    return {
      kind: "url",
      rawValue: raw,
      normalizedUrl: null,
      hostname: null,
      riskLevel: "danger",
      riskScore: 1,
      signals: [{
        code: "invalid_url",
        message: "Nội dung trông giống link nhưng địa chỉ không hợp lệ; ứng dụng sẽ không mở.",
        weight: 1,
      }],
    };
  }
}

/** Classifies QR text so the scanner can safely handle common non-payment QR codes. */
export function parseQrContent(rawValue: string): DecodedQrContent {
  const raw = rawValue.trim();
  const payment = parsePaymentQr(raw);
  if (payment) return { kind: "payment", rawValue: raw, payment };

  const link = analyzeQrLink(raw);
  if (link) return link;

  if (/^WIFI:/i.test(raw)) return { kind: "wifi", rawValue: raw };
  if (/^BEGIN:VCARD/i.test(raw)) return { kind: "contact", rawValue: raw };
  if (/^mailto:/i.test(raw)) return { kind: "email", rawValue: raw };
  if (/^tel:/i.test(raw)) return { kind: "phone", rawValue: raw };
  if (/^(sms:|smsto:)/i.test(raw)) return { kind: "sms", rawValue: raw };
  return { kind: "text", rawValue: raw.length <= MAX_GENERIC_QR_LENGTH ? raw : raw.slice(0, MAX_GENERIC_QR_LENGTH) };
}
