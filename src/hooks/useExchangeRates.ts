import { useEffect, useState } from 'react';

/**
 * Fetches live exchange rates from Frankfurter (https://frankfurter.app).
 * Free, no API key required.
 *
 * Returns rates relative to baseCurrency, e.g. if base=GBP:
 *   { EUR: 1.17, USD: 1.27, GBP: 1 }
 * Meaning: 1 GBP = 1.17 EUR. To convert €X to GBP: X / rates.EUR
 */
export function useExchangeRates(baseCurrency: string) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!baseCurrency) return;
    setRates({});
    setLoading(true);
    setError(false);
    fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`)
      .then((r) => r.json())
      .then((data) => {
        setRates({ ...data.rates, [baseCurrency]: 1 });
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [baseCurrency]);

  return { rates, loading, error };
}
