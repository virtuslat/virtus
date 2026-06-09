// Filtro simple de groserías para el chat. Enmascara las palabras con asteriscos.
// Lista básica en español/inglés; se puede ampliar fácilmente.
const BAD_WORDS = [
  'mierda', 'puta', 'puto', 'pendejo', 'pendeja', 'cabron', 'cabrón', 'gilipollas',
  'culero', 'verga', 'coño', 'chinga', 'chingada', 'joto', 'maricon', 'maricón',
  'malparido', 'hijueputa', 'hpta', 'huevon', 'huevón', 'imbecil', 'imbécil', 'estupido', 'estúpido',
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt',
]

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Detecta la palabra aunque tenga signos alrededor; mantiene la 1ra letra.
const PATTERN = new RegExp(`\\b(${BAD_WORDS.map(escapeRegex).join('|')})\\b`, 'gi')

export function maskProfanity(text: string): string {
  if (!text) return text
  return text.replace(PATTERN, (match) => match[0] + '*'.repeat(Math.max(1, match.length - 1)))
}
