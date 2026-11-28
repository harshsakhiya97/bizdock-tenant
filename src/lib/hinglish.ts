/**
 * Hindi (Devanagari) → Hinglish (Hindi in English letters), letter by letter, the way people type it:
 * "नमस्ते, मैं Priya बोल रही हूँ" → "namaste, main Priya bol rahi hoon". Anything not Devanagari is kept as is.
 * Only for showing text: the original stays saved.
 */

const VOWEL: Record<string, string> = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ॲ: 'e', ऍ: 'e',
}
const MATRA: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
}
const CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', ळ: 'l',
  श: 'sh', ष: 'sh', स: 's', ह: 'h',
  क़: 'q', ख़: 'kh', ग़: 'gh', ज़: 'z', ड़: 'd', ढ़: 'dh', फ़: 'f', य़: 'y',
}
// a consonant + nukta written as two characters
const NUKTA: Record<string, string> = { क: 'q', ख: 'kh', ग: 'gh', ज: 'z', ड: 'd', ढ: 'dh', फ: 'f', य: 'y' }
const DIGIT = '०१२३४५६७८९'
const VIRAMA = '्'
const ANUSVARA = 'ं'
const CHANDRA = 'ँ'
const VISARGA = 'ः'
const NUKTA_SIGN = '़'

/** one syllable: its consonants and its vowel; `inherent` = the vowel is the unwritten "a" */
type Syl = { c: string; v: string; inherent: boolean; nasal: string; tail: string; n?: number }

function word(w: string): string {
  const s: Syl[] = []
  let i = 0
  const chars = [...w]
  while (i < chars.length) {
    const ch = chars[i]
    if (VOWEL[ch] != null) {
      s.push({ c: '', v: VOWEL[ch], inherent: false, nasal: '', tail: '' })
      i++
    } else if (CONS[ch] != null) {
      let c = CONS[ch]
      i++
      if (chars[i] === NUKTA_SIGN) {
        c = NUKTA[ch] ?? c
        i++
      }
      if (chars[i] === VIRAMA) {
        // half letter: joins the next consonant
        i++
        const last = s[s.length - 1]
        if (last && last.inherent === false && last.v === '' && last.nasal === '' && last.c !== '') {
          // "च्छ" is typed "cch" (accha)
          last.c += last.c === 'ch' && ch === 'च' ? '' : c
          last.n = (last.n ?? 1) + 1
        } else s.push({ c, v: '', inherent: false, nasal: '', tail: '', n: 1 })
        continue
      }
      // a half letter waiting for this consonant
      const prev = s[s.length - 1]
      const joined = prev && prev.v === '' && !prev.inherent && prev.nasal === '' && prev.tail === '' && prev.c !== ''
      if (joined) {
        prev.c = prev.c === 'ch' && c === 'chh' ? 'cch' : prev.c + c
        prev.n = (prev.n ?? 1) + 1
      }
      const cur = joined ? prev : { c, v: 'a', inherent: true, nasal: '', tail: '' }
      if (MATRA[chars[i]] != null) {
        cur.v = MATRA[chars[i]]
        cur.inherent = false
        i++
      } else {
        cur.v = 'a'
        cur.inherent = true
      }
      if (!joined) s.push(cur)
    } else if (MATRA[ch] != null) {
      // a stray vowel sign
      s.push({ c: '', v: MATRA[ch], inherent: false, nasal: '', tail: '' })
      i++
    } else if (ch === ANUSVARA || ch === CHANDRA) {
      const last = s[s.length - 1]
      if (last) last.nasal = 'n'
      i++
    } else if (ch === VISARGA) {
      const last = s[s.length - 1]
      if (last) last.tail += 'h'
      i++
    } else {
      i++
    }
  }
  if (!s.length) return w

  // the unwritten "a": dropped at the end of a word ("राम" → ram), and between two sounded syllables ("करना" → karna)
  const keep = s.map(() => true)
  const sounded = (k: number) => s[k] && (s[k].v !== '' && (!s[k].inherent || keep[k]))
  if (s.length > 1 && s[s.length - 1].inherent && !s[s.length - 1].nasal) keep[s.length - 1] = false
  for (let k = s.length - 2; k >= 1; k--) {
    // kept before a cluster: "नमस्ते" → namaste
    if (s[k].inherent && !s[k].nasal && s[k].c && sounded(k + 1) && (s[k + 1].n ?? 1) < 2 && sounded(k - 1) && keep[k - 1]) {
      keep[k] = false
      k--
    }
  }

  let out = ''
  s.forEach((x, k) => {
    let v = x.inherent && !keep[k] ? '' : x.v
    const last = k === s.length - 1
    // the way it's typed: "karna", "rahi", "hoon" (not "karnaa", "rahee")
    if (last && !x.nasal) {
      if (v === 'aa') v = 'a'
      else if (v === 'ee') v = 'i'
    }
    // a nasal: "m" before p / b / m, else "n"
    let n = x.nasal
    if (n) {
      const next = s[k + 1]?.c ?? ''
      n = /^(p|b|bh|m)/.test(next) ? 'm' : 'n'
    }
    out += x.c + v + n + x.tail
  })
  return out
}

// common words, spelt the way people type them
const WORDS: Record<string, string> = {
  में: 'mein', लिए: 'liye', लिये: 'liye', किए: 'kiye', किये: 'kiye', दिए: 'diye', गए: 'gaye', गये: 'gaye', नहीं: 'nahi', नही: 'nahi',
  यहाँ: 'yahan', वहाँ: 'wahan', कहाँ: 'kahan', यहां: 'yahan', वहां: 'wahan', कहां: 'kahan', क्यों: 'kyun', क्यूँ: 'kyun', हाँ: 'haan', हां: 'haan',
  मैं: 'main', हैं: 'hain', है: 'hai', हूँ: 'hoon', हूं: 'hoon', वाला: 'wala', वाली: 'wali', वाले: 'wale', धन्यवाद: 'dhanyavaad', अच्छा: 'accha', अच्छी: 'acchi', अच्छे: 'acche',
}

const DEVANAGARI = /[ऀ-ॿ]+/g

export const hasDevanagari = (t: string | null | undefined) => !!t && /[ऀ-ॿ]/.test(t)

export function toHinglish(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(DEVANAGARI, (m) => {
      // full stops and digits inside a run
      const parts = m.split(/([।॥०-९]+)/)
      return parts
        .map((p) => (/^[।॥०-९]+$/.test(p) ? [...p].map((c) => (c === '।' || c === '॥' ? '.' : String(DIGIT.indexOf(c)))).join('') : WORDS[p] ?? word(p)))
        .join('')
    })
}
