export interface Preselection {
  interest: string;
  product: string;
  /** Intenção vinda do link, só quando válida para o produto; vazia nos links antigos. */
  objective: string;
}

/**
 * Lê a seleção vinda dos links do site, aceitando apenas opções conhecidas.
 * Um produto válido implica o interesse "produto". A intenção só vale com produto e quando o produto a aceita.
 */
export function readPreselection(
  search: string,
  knownInterests: string[],
  knownProducts: string[],
  objectivesByProduct: Record<string, string[]> = {},
): Preselection {
  const params = new URLSearchParams(search);
  const rawInterest = params.get('interesse') ?? '';
  const rawProduct = params.get('produto') ?? '';
  const rawObjective = params.get('objetivo') ?? '';
  const interest = knownInterests.includes(rawInterest) ? rawInterest : '';
  const product = knownProducts.includes(rawProduct) ? rawProduct : '';

  if (product && (interest === '' || interest === 'produto')) {
    return { interest: 'produto', product, objective: validObjective(product, rawObjective, objectivesByProduct) };
  }
  return { interest, product: '', objective: '' };
}

/** A intenção só é aceita se o produto a oferece. */
export function validObjective(product: string, objective: string, objectivesByProduct: Record<string, string[]>): string {
  return (objectivesByProduct[product] ?? []).includes(objective) ? objective : '';
}
