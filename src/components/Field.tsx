/**
 * A labelled form field with its hint or its error underneath, where the
 * DeepSpace polish guide wants validation: next to the field, not in a
 * banner. The error's id is `<id>-error`, for `aria-describedby`.
 */
import type { ReactNode } from 'react'
import { Label } from '@/components/ui'

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
