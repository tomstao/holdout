/**
 * Compares a DeepSpace CollectionSchema with the Zod contract for the same
 * collection and lists every disagreement. Used by schema-drift.test.ts.
 */
import type { CollectionSchema } from 'deepspace/schema'
import type { z } from 'zod'

type Column = CollectionSchema['columns'][number]

export interface DriftIssue {
  collection: string
  field: string
  problem: string
}

type FieldKind = 'text' | 'number' | 'boolean' | 'json' | 'unsupported'

/** Wrapper types whose inner schema decides the storage. */
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'readonly', 'catch'])
const OPTIONAL_WRAPPERS = new Set(['optional', 'default', 'prefault'])

interface Unwrapped {
  kind: FieldKind
  optional: boolean
}

function unwrap(schema: z.ZodType): Unwrapped {
  let current = schema
  let optional = false
  for (;;) {
    const def = current.def as { type: string; innerType?: z.ZodType; in?: z.ZodType }
    if (WRAPPERS.has(def.type) && def.innerType) {
      optional ||= OPTIONAL_WRAPPERS.has(def.type)
      current = def.innerType
    } else if (def.type === 'pipe' && def.in) {
      current = def.in
    } else {
      return { kind: kindOf(current), optional }
    }
  }
}

function kindOf(schema: z.ZodType): FieldKind {
  const def = schema.def as { type: string; values?: unknown[] }
  switch (def.type) {
    case 'string':
    case 'enum':
    case 'template_literal':
      return 'text'
    case 'number':
    case 'int':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'literal': {
      const values = def.values ?? []
      if (values.every((v) => typeof v === 'string')) return 'text'
      if (values.every((v) => typeof v === 'number')) return 'number'
      return 'unsupported'
    }
    case 'object':
    case 'array':
    case 'record':
    case 'tuple':
      return 'json'
    default:
      return 'unsupported'
  }
}

function interpretationKind(column: Column): string {
  const interpretation = column.interpretation
  if (typeof interpretation === 'string') return interpretation
  return typeof interpretation.kind === 'string' ? interpretation.kind : 'object'
}

function columnFits(kind: FieldKind, column: Column): string | null {
  const interpretation = interpretationKind(column)
  switch (kind) {
    case 'text':
      return column.storage === 'text' && interpretation !== 'json'
        ? null
        : 'contract says text; column must be storage "text" and not json'
    case 'number':
      return column.storage === 'number' && interpretation !== 'boolean'
        ? null
        : 'contract says number; column must be storage "number"'
    case 'boolean':
      return column.storage === 'number' && interpretation === 'boolean'
        ? null
        : 'contract says boolean; column must be storage "number" with interpretation { kind: "boolean" }'
    case 'json':
      return column.storage === 'text' && interpretation === 'json'
        ? null
        : 'contract says object/array; column must be storage "text" with interpretation { kind: "json" }'
    case 'unsupported':
      return 'contract uses a Zod type with no column mapping'
  }
}

export function findSchemaDrift(schema: CollectionSchema, contract: z.ZodObject): DriftIssue[] {
  const issues: DriftIssue[] = []
  const shape = contract.shape as Record<string, z.ZodType>
  const columns = new Map(schema.columns.map((column) => [column.name, column]))
  const report = (field: string, problem: string) => {
    issues.push({ collection: schema.name, field, problem })
  }

  for (const [field, fieldSchema] of Object.entries(shape)) {
    const column = columns.get(field)
    if (!column) {
      report(field, 'in the contract but not a column')
      continue
    }
    const { kind, optional } = unwrap(fieldSchema)
    const misfit = columnFits(kind, column)
    if (misfit) report(field, misfit)
    if (optional && column.required) {
      report(
        field,
        'optional in the contract but required by the column, so valid writes would be refused',
      )
    }
  }

  for (const column of schema.columns) {
    if (!(column.name in shape)) report(column.name, 'a column but not in the contract')
  }

  return issues
}
