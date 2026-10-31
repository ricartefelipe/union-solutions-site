export interface Preselection {
  interest: string;
  product: string;
}

/**
 * Lê a seleção vinda dos links do site, aceitando apenas opções conhecidas.
 * Um produto válido implica o interesse "produto".
 */
export function readPreselection(search: string, knownInterests: string[], knownProducts: string[]): Preselection {
  const params = new URLSearchParams(search);
  const rawInterest = params.get('interesse') ?? '';
  const rawProduct = params.get('produto') ?? '';
  const interest = knownInterests.includes(rawInterest) ? rawInterest : '';
  const product = knownProducts.includes(rawProduct) ? rawProduct : '';

  if (product && (interest === '' || interest === 'produto')) {
    return { interest: 'produto', product };
  }
  return { interest, product: '' };
}
