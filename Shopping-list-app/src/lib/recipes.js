import { Fragment, createElement } from 'react'
import { normalizeCategoryName, normalizeIngredientName, normalizeNames, normalizeShoppingCategory } from './ingredients'

export const normalizeRecipeInstructions = (value) => String(value || '').trim()

export const EMPTY_INSTRUCTIONS_TEXT = 'Ingen oppskrift er lagt inn for denne retten ennå.'

export const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const unescapeHtml = (value) =>
  value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

// Markup step: **bold**, *italic* and line breaks. The input is HTML-escaped
// first, so the only tags in the result are the ones added here.
const formatInstructionsAsMarkup = (trimmedValue) => {
  const escapedValue = escapeHtml(trimmedValue)
  const withBold = escapedValue.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const withItalic = withBold.replace(/\*(.+?)\*/g, '<em>$1</em>')
  const withLineBreaks = withItalic.replace(/\n/g, '<br />')

  return withLineBreaks
}

const MARKUP_TOKEN_PATTERN = /(<strong>|<\/strong>|<em>|<\/em>|<br \/>)/

// Builds a tree from the markup the same way a browser parses it: a closing
// tag closes the nearest matching open element, and inner formatting elements
// that were implicitly closed are reopened for the text that follows.
// A closing tag with no matching open element is ignored.
const parseMarkup = (markup) => {
  const root = { tag: null, children: [] }
  const stack = [root]
  const current = () => stack[stack.length - 1]

  for (const token of markup.split(MARKUP_TOKEN_PATTERN)) {
    if (!token) continue

    if (token === '<br />') {
      current().children.push({ tag: 'br', children: [] })
      continue
    }

    if (token === '<strong>' || token === '<em>') {
      const node = { tag: token.slice(1, -1), children: [] }
      current().children.push(node)
      stack.push(node)
      continue
    }

    if (token === '</strong>' || token === '</em>') {
      const tag = token.slice(2, -1)
      let index = stack.length - 1
      while (index > 0 && stack[index].tag !== tag) index -= 1
      if (index === 0) continue

      const reopenTags = stack.splice(index).slice(1).map((node) => node.tag)
      reopenTags.forEach((innerTag) => {
        const node = { tag: innerTag, children: [] }
        current().children.push(node)
        stack.push(node)
      })
      continue
    }

    current().children.push(unescapeHtml(token))
  }

  return root.children
}

const hasContent = (node) => typeof node === 'string' || node.tag === 'br' || node.children.some(hasContent)

const toReactNodes = (nodes) =>
  nodes.filter(hasContent).map((node, index) => {
    if (typeof node === 'string') return node
    if (node.tag === 'br') return createElement('br', { key: index })
    return createElement(node.tag, { key: index }, ...toReactNodes(node.children))
  })

// Renders recipe text with **bold**, *italic* and line breaks as React nodes.
export const renderFormattedInstructions = (instructions) => {
  const trimmedValue = normalizeRecipeInstructions(instructions)
  if (!trimmedValue) {
    return EMPTY_INSTRUCTIONS_TEXT
  }

  return createElement(Fragment, null, ...toReactNodes(parseMarkup(formatInstructionsAsMarkup(trimmedValue))))
}

export const RECIPE_NAME_SUFFIX_PATTERN = /\s\(\d+\)$/

export const getRecipeDisplayName = (recipe) => {
  const recipeName = String(recipe?.name || '').trim()
  const sharedRootName = String(recipe?.sharedRootName || '').trim()

  if (recipe?.sharedVersionNumber) {
    return sharedRootName || recipeName.replace(RECIPE_NAME_SUFFIX_PATTERN, '')
  }

  if (recipe?.sharedRootRecipeId && RECIPE_NAME_SUFFIX_PATTERN.test(recipeName)) {
    return recipeName.replace(RECIPE_NAME_SUFFIX_PATTERN, '')
  }

  return recipeName
}

export const getSharedRecipeDisplayName = (recipe) => {
  const recipeName = String(recipe?.name || '').trim()
  const sharedRootName = String(recipe?.sharedRootName || '').trim()

  if (recipe?.sharedVersionNumber) {
    return `${sharedRootName || recipeName} (${recipe.sharedVersionNumber})`
  }

  return recipeName
}

// Maps a recipes row (with joined recipe_ingredients/recipe_categories/recipe_tags)
// to the shape used in the app. Callers add fields that differ per use.
export const mapRecipeRow = (recipe) => ({
  id: recipe.id,
  name: recipe.name,
  sharedRootRecipeId: recipe.shared_root_recipe_id,
  sharedRootName: recipe.shared_root_name,
  sharedVersionNumber: recipe.shared_version_number,
  ingredients:
    recipe.recipe_ingredients
      ?.map((row) => ({
        name: normalizeIngredientName(row.ingredients?.name),
        quantity: row.quantity ?? 1,
        unit: row.unit ?? '',
        shoppingCategory: normalizeShoppingCategory(row.ingredients?.shopping_category),
      }))
      .filter((ingredient) => ingredient.name) ?? [],
  typeTags:
    normalizeNames(
      recipe.recipe_categories
        ?.map((row) => normalizeCategoryName(row.categories?.name))
        .filter(Boolean) ?? [],
    ),
  occasionTags:
    recipe.recipe_tags?.map((row) => row.tags?.name).filter(Boolean) ?? [],
})

export const isMissingInstructionsColumnError = (error) => {
  const diagnosticText = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return diagnosticText.includes('instructions') && diagnosticText.includes('does not exist')
}
