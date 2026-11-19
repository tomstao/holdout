/**
 * One CSV drop zone: pick or drop a file, then see either what it holds
 * ("6 rows, 2 columns") or its problems, each with its row and column. Used
 * by the create form and by the Submit tab.
 */
import { useId, useRef, useState, type DragEvent } from 'react'
import { CheckIcon, FileTextIcon, TriangleAlertIcon } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { issuePlace } from '../contracts/file-issues'
import type { Issue } from '../contracts/result'

export interface FileDropProps {
  /** `train.csv`, as the host should recognise it. */
  label: string
  /** What the file must contain, in one sentence. */
  hint: string
  /** The chosen file's name, if one was chosen. */
  fileName?: string
  /** "6 rows, 2 columns", shown when the file has no problems. */
  summary?: string
  issues: readonly Issue[]
  disabled?: boolean
  onPick: (file: File) => void
  testId: string
}

export function FileDrop({
  label,
  hint,
  fileName,
  summary,
  issues,
  disabled = false,
  onPick,
  testId,
}: FileDropProps) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hasProblems = issues.length > 0

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !disabled) onPick(file)
  }

  return (
    <div
      data-testid={testId}
      data-state={hasProblems ? 'problems' : summary ? 'ready' : 'empty'}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => {
        setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        'rounded-md border border-dashed border-border p-4 transition-colors',
        dragging && 'border-primary bg-accent',
        hasProblems && 'border-destructive',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="font-mono text-sm font-medium text-foreground">
            {label}
          </label>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {fileName ? 'Replace' : 'Choose a CSV'}
        </Button>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onPick(file)
            // Picking the same file again must fire a change.
            event.target.value = ''
          }}
        />
      </div>

      {fileName && (
        <p className="mt-3 flex items-center gap-2 text-sm text-foreground">
          {hasProblems ? (
            <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : summary ? (
            <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" />
          ) : (
            <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-mono">{fileName}</span>
          {!hasProblems && summary && (
            <span className="text-muted-foreground">Ready: {summary}</span>
          )}
        </p>
      )}

      {hasProblems && (
        <ul className="mt-3 space-y-1 text-sm" aria-label={`Problems in ${label}`}>
          {issues.map((issue, index) => {
            const place = issuePlace(issue)
            return (
              <li key={index} className="text-destructive">
                {place && <span className="font-mono">{place}: </span>}
                {issue.message}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
