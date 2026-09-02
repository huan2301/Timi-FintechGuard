export type BankOption = {
  code: string;
  name: string;
};

// Keep this list aligned with the web transfer form. The API still receives
// the stable bank code, while the user sees a readable bank name.
export const banks: BankOption[] = [
  { code: 'ABB', name: 'ABBank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'AGRIBANK', name: 'Agribank' },
  { code: 'BAB', name: 'Bac A Bank' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'BVB', name: 'BaoViet Bank' },
  { code: 'CAKE', name: 'Cake by VPBank' },
  { code: 'CIMB', name: 'CIMB Vietnam' },
  { code: 'CTG', name: 'VietinBank' },
  { code: 'EIB', name: 'Eximbank' },
  { code: 'GPB', name: 'GPBank' },
  { code: 'HDB', name: 'HDBank' },
  { code: 'HSBC', name: 'HSBC Vietnam' },
  { code: 'IVB', name: 'Indovina Bank' },
  { code: 'KBANK', name: 'Kasikornbank' },
  { code: 'KLB', name: 'KienlongBank' },
  { code: 'LPB', name: 'LPBank' },
  { code: 'MBB', name: 'MB Bank' },
  { code: 'MSB', name: 'MSB' },
  { code: 'NAB', name: 'Nam A Bank' },
  { code: 'OCB', name: 'OCB' },
  { code: 'PGB', name: 'PGBank' },
  { code: 'PVCB', name: 'PVcomBank' },
  { code: 'SCB', name: 'SCB' },
  { code: 'SCVN', name: 'Standard Chartered Vietnam' },
  { code: 'SEAB', name: 'SeABank' },
  { code: 'SGB', name: 'Saigonbank' },
  { code: 'SHB', name: 'SHB' },
  { code: 'SHINHAN', name: 'Shinhan Bank' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'TIMO', name: 'Timo' },
  { code: 'TIMI', name: 'Timi Bank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'UBANK', name: 'Ubank by VPBank' },
  { code: 'UOB', name: 'UOB Vietnam' },
  { code: 'VAB', name: 'Viet A Bank' },
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'VIB', name: 'VIB' },
  { code: 'WOORI', name: 'Woori Bank Vietnam' },
];

export function getBankName(code?: string | null) {
  if (!code) return 'Chưa chọn ngân hàng';
  return banks.find((bank) => bank.code === code.toUpperCase())?.name || code;
}
