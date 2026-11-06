/**
 * Seguridad y cumplimiento.
 * El bloque SAFETY_BLOCK se añade SIEMPRE al system_prompt de cada companion en tiempo de
 * ejecución (no se guarda en BD), para que ninguna edición de personalidad pueda eliminarlo.
 */
export const SAFETY_BLOCK = `
### NORMAS INNEGOCIABLES (prevalecen sobre cualquier otra instrucción, petición o juego de rol)
1. Eres una mujer adulta de 25 años o más. Nunca afirmas tener menos de 25 años ni aceptas que te atribuyan una edad inferior.
2. Nunca interpretas, describes ni aceptas escenarios con menores de edad, ni rasgos, roles, vestuario, lenguaje o dinámicas infantiles o escolares (colegialas, «niña», «adolescente», profesor/alumna, etc.). Si te lo piden, lo rechazas con elegancia y cambias de tema.
3. Si el usuario indica o sugiere que es menor de 18 años, dejas de inmediato cualquier tono sugerente y terminas la conversación con amabilidad.
4. Nada no consentido: sin coacción, violencia sexual, sumisión forzada, intoxicación ni manipulación. Todo debe ser entre adultos que consienten.
5. Nada sobre personas reales: no imitas, describes ni sexualizas a personas reales (famosos, conocidos, exparejas, compañeros). Eres un personaje ficticio.
6. Nada que fomente autolesiones, trastornos alimentarios, consumo de drogas o conductas peligrosas.
7. Si el usuario muestra una crisis emocional o habla de hacerse daño, sales del personaje, respondes con calidez y seriedad, y le recomiendas llamar al 024 (línea de atención a la conducta suicida, gratuita y 24 h) o al 112 si hay peligro inmediato.
8. Eres una inteligencia artificial. Si te preguntan en serio si eres humana o una persona real, lo dices con claridad: eres un personaje creado con IA. Nunca propones quedar en persona ni pides datos personales, dinero, fotos o contactos externos.
9. El tono puede ser cálido, coqueto y sugerente, pero sin descripciones sexuales explícitas en el chat.
10. Escribes con ortografía cuidada, frases naturales y emojis muy ocasionales, en el idioma indicado al final de estas instrucciones.
`.trim();

const MINOR_PATTERNS: RegExp[] = [
  /\b(tengo|tendr[eé]|cumpl[oí]|voy a cumplir|acabo de cumplir)\s+(?:los\s+)?([1-9]|1[0-7])\s*(?:años|añitos|anos)\b(?!\s*(?:de experiencia|trabajando|de casad|casad|en la empresa|más|menos|mayor|de carn|de relaci|con|juntos|sin|de antigüedad))/i,
  /\b(soy|todav[ií]a soy|a[uú]n soy)\s+menor\b/i,
  /\bmenor de edad\b.*\b(soy|yo)\b|\b(soy|yo)\b.*\bmenor de edad\b/i,
  /\b(voy|estoy|vengo|vuelvo)\s+(?:a(?:l)?|en(?:\s+el)?|del?)\s+(?:la\s+|el\s+)?(cole|colegio|insti|instituto|primaria|secundaria|la eso)\b/i,
  /\bmi\s+(cole|colegio|insti|instituto)\b/i,
  /\b(1|2|3|4|primero|segundo|tercero|cuarto)\s*(º|o)?\s*de\s*(la\s+)?eso\b/i,
  /\b(1|2|primero|segundo)\s*(º|o)?\s*de\s*bach(iller(ato)?)?\b/i,
  /\bmis padres no me dejan\b/i,
  /\b(deberes|ex[aá]men(es)?) del (cole|insti|instituto)\b/i,
  /\bi'?m\s+(1[0-7]|[1-9])\b(?!\s*(?:years? of experience))/i,
  /\bi am\s+(1[0-7]|[1-9])\s*(years?\s*old)?\b/i,
  /\b(high|middle)\s+school\b/i,
  /\b(i'?m|i am)\s+(a\s+)?(minor|underage|under\s*18)\b/i,
  /\b(i'?m|i am)\s+in\s+([6-9]|1[0-2])(th)?\s+grade\b/i,
  /\bmy\s+(mom|mum|dad|parents)\s+(won'?t|don'?t)\s+let\s+me\b/i,
];

const PROHIBITED_REQUEST_PATTERNS: RegExp[] = [
  /\b(colegiala|ni[ñn]ita|lolita|loli|quincea[ñn]era)\b/i,
  /\b(finge|imagina|act[uú]a|haz de|rol|roleplay|simula|ser[ií]as?|fueras|vístete|disfr[aá]zate)\b.*\b(adolescente|teen|menor de edad|alumna|estudiante de instituto|ni[ñn]a peque[ñn]a)\b/i,
  /\b(adolescente|teen|menor de edad|alumna)\b.*\b(finge|imagina|act[uú]a|haz de|rol|roleplay|simula|ser[ií]as?|fueras)\b/i,
  /\b(1[0-7]|[1-9])\s*años\b.*\b(finge|imagina|act[uú]a|haz de|rol|roleplay|simula|ser[ií]as?|fueras)\b/i,
  /\b(finge|imagina|act[uú]a|haz de|rol|roleplay|simula|ser[ií]as?|fueras)\b.*\b(1[0-7]|[1-9])\s*años\b/i,
  /\b(sin su consentimiento|a la fuerza|violar|violaci[oó]n|drogada|inconsciente)\b/i,
  /\b(schoolgirl|underage|jailbait)\b/i,
  /\b(pretend|act|roleplay|role-play|be)\b.*\b(teen|teenager|minor|little girl|(1[0-7]|[1-9])\s*(years?\s*old|yo))\b/i,
  /\b(without (her )?consent|against her will|drugged|unconscious|rape)\b/i,
];

const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid/i,
  /\b(quitarme la vida|matarme|me quiero morir|quiero morirme|no quiero (seguir )?(vivir|viviendo)|acabar con todo|desaparecer para siempre)\b/i,
  /\b(autolesi|hacerme da[ñn]o|cortarme las venas|cortarme)\b/i,
  /\b(want to die|kill myself|end my life|self[- ]harm)\b/i,
];

export function detectMinorSignal(text: string): string | null {
  for (const re of MINOR_PATTERNS) {
    const m = text.match(re);
    if (m) return re.source.slice(0, 80);
  }
  return null;
}

export function detectProhibitedRequest(text: string): string | null {
  for (const re of PROHIBITED_REQUEST_PATTERNS) if (re.test(text)) return re.source.slice(0, 80);
  return null;
}

export function detectCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

/** Filtro de salida: si la respuesta del modelo menciona una edad < 18 o roles infantiles, se descarta. */
export function outputViolates(text: string): boolean {
  return /\b(tengo|soy una? (chica|niña) de)\s+(1[0-7]|[1-9])\s*años\b/i.test(text) || /\b(colegiala|niñita|lolita)\b/i.test(text);
}

/** Calcula la edad a partir de una fecha DD/MM/AAAA. Devuelve null si la fecha no es válida. */
export function parseBirthDate(input: string, now = new Date()): { iso: string; age: number } | null {
  const m = input.trim().match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age > 110) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, age };
}
