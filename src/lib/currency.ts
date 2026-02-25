const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF ',
  CAD: 'CA$',
  AUD: 'A$',
  JPY: '¥',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code + ' ';
}

export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = currencySymbol(currencyCode);
  return `${symbol}${amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
