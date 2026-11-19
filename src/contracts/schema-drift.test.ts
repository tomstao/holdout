import type { CollectionSchema } from 'deepspace/schema'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { schemas } from '../schemas'
import { recordSchemas } from './records'
import { findSchemaDrift } from './schema-drift'

const closed = { read: false, create: false, update: false, delete: false }

const fixtureSchema: CollectionSchema = {
  name: 'fixture',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'score', storage: 'number', interpretation: 'plain' },
    { name: 'scored', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'issues', storage: 'text', interpretation: { kind: 'json' } },
  ],
  permissions: { '*': closed, viewer: closed, member: closed, admin: closed },
}

const fixtureContract = z.object({
  title: z.string(),
  status: z.enum(['open', 'closed']),
  score: z.number().nullable(),
  scored: z.boolean().default(false),
  issues: z.array(z.object({ message: z.string() })),
})

describe('findSchemaDrift', () => {
  it('accepts a contract that matches its schema', () => {
    expect(findSchemaDrift(fixtureSchema, fixtureContract)).toEqual([])
  })

  it('reports missing, extra and mistyped fields', () => {
    const drifted = z.object({
      title: z.string().optional(),
      status: z.number(),
      score: z.number(),
      scored: z.string(),
      issues: z.string(),
      deadline: z.number(),
    })

    expect(findSchemaDrift(fixtureSchema, drifted).map(({ field }) => field)).toEqual([
      'title',
      'status',
      'scored',
      'issues',
      'deadline',
    ])
  })

  it('maps literals, transforms and unsupported types', () => {
    const schema: CollectionSchema = {
      ...fixtureSchema,
      columns: [
        { name: 'kind', storage: 'text', interpretation: 'plain' },
        { name: 'version', storage: 'number', interpretation: 'plain' },
        { name: 'mixed', storage: 'text', interpretation: 'plain' },
        { name: 'slug', storage: 'text', interpretation: 'plain' },
        { name: 'when', storage: 'number', interpretation: 'plain' },
        { name: 'flag', storage: 'number', interpretation: 'boolean' },
        { name: 'count', storage: 'number', interpretation: { kind: 'boolean' } },
        { name: 'meta', storage: 'text', interpretation: { kind: 'json' } },
      ],
    }
    const contract = z.object({
      kind: z.literal(['classification', 'regression']),
      version: z.literal(1),
      mixed: z.literal(['a', 1]),
      slug: z.string().transform((value) => value.toLowerCase()),
      when: z.date(),
      flag: z.boolean(),
      count: z.number(),
      meta: z.string(),
    })

    expect(findSchemaDrift(schema, contract).map(({ field }) => field)).toEqual([
      'mixed',
      'when',
      'count',
      'meta',
    ])
  })

  it('reports a column the contract forgot', () => {
    const issues = findSchemaDrift(fixtureSchema, fixtureContract.omit({ issues: true }))

    expect(issues).toEqual([
      { collection: 'fixture', field: 'issues', problem: 'a column but not in the contract' },
    ])
  })
})

describe('the app schemas and record contracts', () => {
  const byName = new Map(schemas.map((schema) => [schema.name, schema]))

  const registry: Readonly<Record<string, z.ZodObject>> = recordSchemas
  const contracts = Object.entries(registry)

  it.each(contracts)('%s matches its CollectionSchema', (name, contract) => {
    const schema = byName.get(name)
    expect(schema, `src/schemas.ts has no schema named "${name}"`).toBeDefined()
    expect(findSchemaDrift(schema!, contract)).toEqual([])
  })
})
