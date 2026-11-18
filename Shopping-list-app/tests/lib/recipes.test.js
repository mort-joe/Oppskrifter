// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  EMPTY_INSTRUCTIONS_TEXT,
  getRecipeDisplayName,
  getSharedRecipeDisplayName,
  isMissingInstructionsColumnError,
  mapRecipeRow,
  renderFormattedInstructions,
} from '../../src/lib/recipes'

// The implementation the app used before rendering with React nodes. It is the
// reference: the DOM the browser builds from this HTML must equal the DOM
// React renders.
const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const legacyRenderFormattedInstructions = (instructions) => {
  const trimmedValue = String(instructions || '').trim()
  if (!trimmedValue) {
    return 'Ingen oppskrift er lagt inn for denne retten ennå.'
  }

  const escapedValue = escapeHtml(trimmedValue)
  const withBold = escapedValue.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const withItalic = withBold.replace(/\*(.+?)\*/g, '<em>$1</em>')
  return withItalic.replace(/\n/g, '<br />')
}

const domFromLegacy = (text) => {
  const container = document.createElement('div')
  container.innerHTML = legacyRenderFormattedInstructions(text)
  return container.innerHTML
}

const domFromReact = (text) => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(renderFormattedInstructions(text)).replace(/<!-- -->/g, '')
  return container.innerHTML
}

const SAMPLES = [
  '',
  '   ',
  'Kok pasta.',
  '**Fet** tekst',
  '*Kursiv* tekst',
  'Bland **fet** og *kursiv* og **fet med *kursiv* inni**',
  '## Overskrift\n- punkt en\n- punkt to',
  'Linje 1\n\nLinje 3\r\nLinje 4',
  '<script>alert(1)</script> & "sitat" \'apostrof\'',
  '**a&b** *c<d*',
  '***tre stjerner***',
  '**a *b** c*',
  '*a **b* c**',
  '**',
  '****',
  '*',
  'a * b * c',
  '* a *',
  '*a**b*',
  '**a\nb**',
  '**a** og *b* og **c *d* e**',
  'Smør og brød, æøå ÆØÅ',
  '**uten slutt',
  'uten start**',
  '* * *',
  '**x**y**z**',
]

// Deterministic pseudo-random strings over the characters that matter to the parser.
const ALPHABET = ['*', '*', 'a', 'b', ' ', '\n', '<', '&', '"']
const randomSamples = (count, length) => {
  let seed = 12345
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed
  }
  return Array.from({ length: count }, () =>
    Array.from({ length }, () => ALPHABET[next() % ALPHABET.length]).join(''),
  )
}

describe('renderFormattedInstructions', () => {
  it('returns the placeholder text for empty instructions', () => {
    expect(renderFormattedInstructions('')).toBe(EMPTY_INSTRUCTIONS_TEXT)
    expect(renderFormattedInstructions('   \n ')).toBe(EMPTY_INSTRUCTIONS_TEXT)
    expect(renderFormattedInstructions(null)).toBe(EMPTY_INSTRUCTIONS_TEXT)
  })

  it('escapes HTML instead of rendering it', () => {
    expect(domFromReact('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('renders bold, italic and line breaks', () => {
    expect(domFromReact('**Fet**\n*Kursiv*')).toBe('<strong>Fet</strong><br><em>Kursiv</em>')
  })

  it.each(SAMPLES)('matches the previous innerHTML rendering for %j', (sample) => {
    expect(domFromReact(sample)).toBe(domFromLegacy(sample))
  })

  it('matches the previous innerHTML rendering for random markup', () => {
    for (const sample of randomSamples(400, 12)) {
      expect(domFromReact(sample), JSON.stringify(sample)).toBe(domFromLegacy(sample))
    }
  })
})

describe('getRecipeDisplayName', () => {
  it('uses the shared root name for versioned copies', () => {
    expect(getRecipeDisplayName({ name: 'Taco (2)', sharedRootName: 'Taco', sharedVersionNumber: 2 })).toBe('Taco')
    expect(getRecipeDisplayName({ name: 'Taco (2)', sharedRootName: '', sharedVersionNumber: 1 })).toBe('Taco')
  })

  it('strips the "(n)" suffix only for imported copies', () => {
    expect(getRecipeDisplayName({ name: 'Taco (3)', sharedRootRecipeId: 7 })).toBe('Taco')
    expect(getRecipeDisplayName({ name: 'Taco (3)' })).toBe('Taco (3)')
    expect(getRecipeDisplayName({ name: '  Taco  ' })).toBe('Taco')
    expect(getRecipeDisplayName(null)).toBe('')
  })
})

describe('getSharedRecipeDisplayName', () => {
  it('appends the version number when set', () => {
    expect(getSharedRecipeDisplayName({ name: 'Taco (2)', sharedRootName: 'Taco', sharedVersionNumber: 2 })).toBe('Taco (2)')
    expect(getSharedRecipeDisplayName({ name: 'Taco', sharedVersionNumber: 3 })).toBe('Taco (3)')
    expect(getSharedRecipeDisplayName({ name: 'Taco' })).toBe('Taco')
  })
})

describe('mapRecipeRow', () => {
  it('maps joined rows and normalizes names', () => {
    const mapped = mapRecipeRow({
      id: 1,
      name: 'Suppe',
      shared_root_recipe_id: null,
      shared_root_name: null,
      shared_version_number: null,
      recipe_ingredients: [
        { quantity: 2, unit: 'dl', ingredients: { name: 'Soyasaus2', shopping_category: 'Annet' } },
        { quantity: null, unit: null, ingredients: { name: 'Løk', shopping_category: '' } },
        { quantity: 1, unit: '', ingredients: null },
      ],
      recipe_categories: [{ categories: { name: 'Supper' } }, { categories: { name: 'Suppe' } }, { categories: null }],
      recipe_tags: [{ tags: { name: 'Hverdag' } }, { tags: null }],
    })

    expect(mapped).toEqual({
      id: 1,
      name: 'Suppe',
      sharedRootRecipeId: null,
      sharedRootName: null,
      sharedVersionNumber: null,
      ingredients: [
        { name: 'Soyasaus', quantity: 2, unit: 'dl', shoppingCategory: 'annet' },
        { name: 'Løk', quantity: 1, unit: '', shoppingCategory: 'annet' },
      ],
      typeTags: ['Suppe'],
      occasionTags: ['Hverdag'],
    })
  })

  it('handles rows without joins', () => {
    expect(mapRecipeRow({ id: 2, name: 'Tom' })).toMatchObject({ ingredients: [], typeTags: [], occasionTags: [] })
  })
})

describe('isMissingInstructionsColumnError', () => {
  it('detects the missing column error from Postgres', () => {
    expect(isMissingInstructionsColumnError({ message: 'column recipes.instructions does not exist' })).toBe(true)
    expect(isMissingInstructionsColumnError({ message: 'permission denied' })).toBe(false)
    expect(isMissingInstructionsColumnError(null)).toBe(false)
  })
})
