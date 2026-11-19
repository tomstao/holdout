/**
 * The Edit tab, for the host only (spec F5): the title, the summary, the
 * description, and the deadline, which only moves later. Files, task, metric
 * and split are fixed once created.
 *
 * The one write is `callAction('updateCompetition')`. Moving the deadline
 * asks first, naming the new time: it cannot be moved back.
 */
import { useState, type SyntheticEvent } from 'react'
import { Button, ConfirmModal, Input, Textarea, useToast } from '@/components/ui'
import { callAction } from '../../client/actions'
import { Field } from '../../components/Field'
import { actionContracts } from '../../contracts/actions'
import type { CompetitionRecord } from '../../contracts/competitions'
import { deadlineChangeProblem, type Phase } from '../../domain/time'

interface EditTabProps {
  competitionId: string
  competition: CompetitionRecord
  phase: Phase
}

/** `2026-11-26T18:05`: what a `datetime-local` input takes, in the viewer's time zone. */
function toLocalInput(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

const when = (time: number) =>
  new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function EditTab({ competitionId, competition, phase }: EditTabProps) {
  const toast = useToast()
  const [title, setTitle] = useState(competition.title)
  const [summary, setSummary] = useState(competition.summary)
  const [description, setDescription] = useState(competition.description)
  const [deadline, setDeadline] = useState(() => toLocalInput(competition.deadline))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  /** The later deadline waiting for the host's yes. */
  const [asking, setAsking] = useState<number | undefined>()

  if (phase !== 'open') {
    return (
      <p data-testid="edit-closed" className="py-10 text-center text-sm text-foreground">
        This competition has closed. It can no longer be edited.
      </p>
    )
  }

  // The input shows minutes; the stored deadline may hold seconds. An input
  // left as it was means the stored deadline, not that minute rounded down.
  const nextDeadline =
    deadline === toLocalInput(competition.deadline)
      ? competition.deadline
      : new Date(deadline).getTime()
  const input = { competitionId, title, summary, description, deadline: nextDeadline }
  const changed =
    title.trim() !== competition.title ||
    summary.trim() !== competition.summary ||
    description !== competition.description ||
    nextDeadline !== competition.deadline

  const clearError = (field: string) => {
    setFieldErrors(({ [field]: _cleared, ...rest }) => rest)
  }
  const errorProps = (field: string) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `edit-${field}-error` } : {}

  const send = async () => {
    setSaving(true)
    try {
      const result = await callAction('updateCompetition', input)
      if (result.success) {
        const moved = result.data.deadline !== competition.deadline
        toast.success('Saved.', moved ? `The deadline is now ${when(result.data.deadline)}.` : '')
        setTitle(title.trim())
        setSummary(summary.trim())
        setDeadline(toLocalInput(result.data.deadline))
        return
      }
      setFieldErrors(
        Object.fromEntries(
          (result.issues ?? []).map((issue) => [issue.path?.[0] ?? 'form', issue.message]),
        ),
      )
      toast.error(result.error)
    } finally {
      setSaving(false)
      setAsking(undefined)
    }
  }

  const save = (event: SyntheticEvent) => {
    event.preventDefault()
    const errors: Record<string, string> = {}
    const parsed = actionContracts.updateCompetition.input.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message
    }
    const late = deadlineChangeProblem(competition.deadline, nextDeadline, Date.now())
    if (late) errors.deadline = late
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.warning('Check the highlighted fields.')
      return
    }
    if (nextDeadline !== competition.deadline) setAsking(nextDeadline)
    else void send()
  }

  return (
    <form data-testid="edit-form" noValidate onSubmit={save} className="max-w-2xl space-y-5 py-4">
      <Field id="edit-title" label="Title" error={fieldErrors.title}>
        <Input
          id="edit-title"
          value={title}
          maxLength={80}
          onChange={(event) => {
            setTitle(event.target.value)
            clearError('title')
          }}
          {...errorProps('title')}
        />
      </Field>
      <Field
        id="edit-summary"
        label="Summary"
        hint="One sentence, shown in the list of competitions."
        error={fieldErrors.summary}
      >
        <Input
          id="edit-summary"
          value={summary}
          maxLength={200}
          onChange={(event) => {
            setSummary(event.target.value)
            clearError('summary')
          }}
          {...errorProps('summary')}
        />
      </Field>
      <Field
        id="edit-description"
        label="Description"
        hint="Optional. Plain text; line breaks are kept."
        error={fieldErrors.description}
      >
        <Textarea
          id="edit-description"
          rows={6}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            clearError('description')
          }}
          {...errorProps('description')}
        />
      </Field>
      <Field
        id="edit-deadline"
        label="Deadline"
        hint={`Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. It can only move later, up to 90 days from now.`}
        error={fieldErrors.deadline}
      >
        <Input
          id="edit-deadline"
          type="datetime-local"
          className="max-w-xs"
          value={deadline}
          min={toLocalInput(competition.deadline)}
          onChange={(event) => {
            setDeadline(event.target.value)
            clearError('deadline')
          }}
          {...errorProps('deadline')}
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        The files, the task, the metric and the public share are fixed once a competition exists.
      </p>
      <Button type="submit" data-testid="edit-save" loading={saving} disabled={!changed}>
        Save changes
      </Button>

      <ConfirmModal
        open={asking !== undefined}
        onClose={() => {
          setAsking(undefined)
        }}
        onConfirm={() => void send()}
        title="Move the deadline?"
        // The time goes in the body: the dialog cuts a long title short.
        description={
          asking === undefined
            ? undefined
            : `The new deadline is ${when(asking)}. Participants can submit until then. A deadline cannot be moved back.`
        }
        confirmText="Move the deadline"
        variant="default"
        loading={saving}
      />
    </form>
  )
}
