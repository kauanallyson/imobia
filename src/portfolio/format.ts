const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatPrice(cents: number) {
  return brl.format(cents / 100)
}

// Accepts what a Broker types: "150.000,50", "150000,50", "150000.50" or "R$ 150.000".
export function parseDecimal(text: string) {
  const cleaned = text.replace(/R\$|\s/g, '')
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned
  return normalized === '' ? Number.NaN : Number(normalized)
}

export function centsToInput(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
