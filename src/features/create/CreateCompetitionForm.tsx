/**
 * The form a host fills to create a competition: details, files, rules.
 *
 * The three files are checked in the browser as they are dropped, with the
 * domain code the server runs again as the authority. Create stays disabled
 * until they pass. The only write is `callAction('createCompetition')`.
 */
import { useMemo, useState, type SyntheticEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from '@/components/ui'
import { callAction } from '../../client/actions'
import { actionContracts } from '../../contracts/actions'
import type { Issue } from '../../contracts/result'
import type { DatasetFile } from '../../domain/dataset'
import { METRIC_INFO, metricsFor, type Metric, type TaskType } from '../../domain/metrics'
import { DAY_MS, deadlineProblem } from '../../domain/time'
import {
  checkDataset,
  columnChoices,
  groupByFile,
  lookAtFile,
  tooLargeToRead,
  type FileLook,
  type PickedFiles,
} from './check'
import { FileDrop } from './FileDrop'

const FILES: { kind: DatasetFile; label: string; hint: string }[] = [
  {
    kind: 'train',
    label: 'train.csv',
    hint: 'Rows to learn from: the ID, the features and the target. At most 5 MB.',
  },
  {
    kind: 'test',
    label: 'test.csv',
    hint: 'Rows to predict: the ID and the features, without the target. At most 2 MB.',
  },
  {
    kind: 'solution',
    label: 'solution.csv',
    hint: 'The answers: ID and target for every test row. Never shown to anyone. At most 1.5 MB.',
  },
]

const TASK_NAMES: Record<TaskType, string> = {
  classification: 'Classification',
  regression: 'Regression',
}

const NO_ISSUES: Record<DatasetFile, Issue[]> = { train: [], test: [], solution: [] }

/** `2026-11-26T18:00`, the value a `datetime-local` input takes, in the viewer's time zone. */
function toLocalInput(time: number): string {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

export function CreateCompetitionForm() {
  const navigate = useNavigate()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('classification')
  const [metric, setMetric] = useState<Metric>('accuracy')
  const [idColumn, setIdColumn] = useState('')
  const [targetColumn, setTargetColumn] = useState('')
  const [deadline, setDeadline] = useState(() => toLocalInput(Date.now() + 7 * DAY_MS))
  const [dailyLimit, setDailyLimit] = useState('5')
  const [scoreDecimals, setScoreDecimals] = useState('4')
  const [publicPercent, setPublicPercent] = useState('30')

  const [files, setFiles] = useState<PickedFiles>({})
  const [names, setNames] = useState<Partial<Record<DatasetFile, string>>>({})
  const [looks, setLooks] = useState<Partial<Record<DatasetFile, FileLook>>>({})
  const [serverIssues, setServerIssues] = useState(NO_ISSUES)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const publicShare = Number(publicPercent) / 100
  const check = useMemo(
    () => checkDataset({ taskType, idColumn, targetColumn, publicShare }, files),
    [taskType, idColumn, targetColumn, publicShare, files],
  )
  const solutionLook = looks.solution
  const columns = solutionLook?.ok ? columnChoices(solutionLook.header) : []
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const pick = async (kind: DatasetFile, file: File) => {
    setServerIssues((current) => ({ ...current, [kind]: [] }))
    setNames((current) => ({ ...current, [kind]: file.name }))
    const tooLarge = tooLargeToRead(kind, file.size)
    if (tooLarge) {
      setFiles((current) => ({ ...current, [kind]: undefined }))
      setLooks((current) => ({ ...current, [kind]: { ok: false, issues: [tooLarge] } }))
      return
    }
    const picked = { name: file.name, text: await file.text() }
    const look = lookAtFile(kind, picked)
    setLooks((current) => ({ ...current, [kind]: look }))
    setFiles((current) => ({ ...current, [kind]: look.ok ? picked : undefined }))
    if (kind === 'solution' && look.ok) {
      // Kaggle's layout: the ID first, the target second.
      const [first = '', second = ''] = columnChoices(look.header)
      setIdColumn(first)
      setTargetColumn(second)
    }
  }

  /** An edited field is no longer known to be wrong: its message goes until the next check. */
  const clearError = (field: string) => {
    setFieldErrors((current) => {
      if (!(field in current)) return current
      return Object.fromEntries(Object.entries(current).filter(([name]) => name !== field))
    })
  }

  const changeTask = (next: string) => {
    const task = next === 'regression' ? 'regression' : 'classification'
    setTaskType(task)
    setMetric(metricsFor(task)[0] ?? 'accuracy')
    clearError('metric')
  }

  const issuesOf = (kind: DatasetFile): Issue[] => {
    const look = looks[kind]
    if (look && !look.ok) return look.issues
    return [...(check.state === 'problems' ? check.issues[kind] : []), ...serverIssues[kind]]
  }
  const summaryOf = (kind: DatasetFile): string | undefined => {
    const look = looks[kind]
    return look?.ok ? look.summary : undefined
  }

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault()
    const { train, test, solution } = files
    if (check.state !== 'ok' || !train || !test || !solution) return

    const input = {
      title,
      summary,
      description,
      taskType,
      metric,
      idColumn,
      targetColumn,
      deadline: new Date(deadline).getTime(),
      dailyLimit: Number(dailyLimit),
      scoreDecimals: Number(scoreDecimals),
      publicShare,
      files: {
        train: { name: train.name, csv: train.text },
        test: { name: test.name, csv: test.text },
        solution: { name: solution.name, csv: solution.text },
      },
    }
    const errors: Record<string, string> = {}
    const parsed = actionContracts.createCompetition.input.safeParse(input)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] ??= issue.message
      }
    }
    const late = deadlineProblem(input.deadline, Date.now())
    if (late) errors.deadline = late
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.warning('Check the highlighted fields.')
      return
    }

    setSubmitting(true)
    try {
      const result = await callAction('createCompetition', input)
      if (result.success) {
        toast.success('Competition created.')
        await navigate(`/c/${result.data.competitionId}`)
        return
      }
      const issues = result.issues ?? []
      setServerIssues(groupByFile(issues))
      setFieldErrors(
        Object.fromEntries(
          issues
            .filter((issue) => !['train', 'test', 'solution'].includes(issue.path?.[0] ?? ''))
            .map((issue) => [issue.path?.[0] ?? 'form', issue.message]),
        ),
      )
      toast.error(result.error)
    } finally {
      setSubmitting(false)
    }
  }

  const errorProps = (field: string) =>
    fieldErrors[field] ? { 'aria-invalid': true, 'aria-describedby': `${field}-error` } : {}

  return (
    <form
      data-testid="create-form"
      className="space-y-8"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <section className="space-y-5">
        <h2 className="text-base font-semibold text-foreground">Details</h2>
        <Field id="title" label="Title" error={fieldErrors.title}>
          <Input
            id="title"
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
          id="summary"
          label="Summary"
          hint="One sentence, shown in the list of competitions."
          error={fieldErrors.summary}
        >
          <Input
            id="summary"
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
          id="description"
          label="Description"
          hint="Optional. Plain text; line breaks are kept."
          error={fieldErrors.description}
        >
          <Textarea
            id="description"
            rows={5}
            value={description}
            maxLength={5000}
            onChange={(event) => {
              setDescription(event.target.value)
              clearError('description')
            }}
            {...errorProps('description')}
          />
        </Field>
      </section>

      <Section title="Files">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="taskType" label="Task">
            <Select value={taskType} onValueChange={changeTask}>
              <SelectTrigger id="taskType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classification">{TASK_NAMES.classification}</SelectItem>
                <SelectItem value="regression">{TASK_NAMES.regression}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="metric"
            label="Metric"
            hint={METRIC_INFO[metric].higherIsBetter ? 'Higher is better.' : 'Lower is better.'}
            error={fieldErrors.metric}
          >
            <Select
              value={metric}
              onValueChange={(next) => {
                const chosen = metricsFor(taskType).find((candidate) => candidate === next)
                if (chosen) setMetric(chosen)
                clearError('metric')
              }}
            >
              <SelectTrigger id="metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metricsFor(taskType).map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {METRIC_INFO[candidate].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="space-y-4">
          {FILES.map(({ kind, label, hint }) => (
            <FileDrop
              key={kind}
              testId={`file-${kind}`}
              label={label}
              hint={hint}
              fileName={names[kind]}
              summary={summaryOf(kind)}
              issues={issuesOf(kind)}
              disabled={submitting}
              onPick={(file) => void pick(kind, file)}
            />
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="idColumn"
            label="ID column"
            hint={columns.length === 0 ? 'Choose solution.csv first.' : undefined}
            error={fieldErrors.idColumn}
          >
            <Select
              value={idColumn}
              onValueChange={(next) => {
                setIdColumn(next)
                clearError('idColumn')
                clearError('targetColumn')
              }}
              disabled={columns.length === 0}
            >
              <SelectTrigger id="idColumn">
                <SelectValue placeholder="Column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            id="targetColumn"
            label="Target column"
            hint={columns.length === 0 ? 'Choose solution.csv first.' : undefined}
            error={fieldErrors.targetColumn}
          >
            <Select
              value={targetColumn}
              onValueChange={(next) => {
                setTargetColumn(next)
                clearError('targetColumn')
              }}
              disabled={columns.length === 0}
            >
              <SelectTrigger id="targetColumn">
                <SelectValue placeholder="Column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {check.state === 'ok' && (
          <p data-testid="dataset-summary" className="text-sm text-foreground">
            <span className="font-mono tabular-nums">
              {check.dataset.testRows.toLocaleString('en-US')}
            </span>{' '}
            test rows:{' '}
            <span className="font-mono tabular-nums">
              {check.dataset.publicRows.toLocaleString('en-US')}
            </span>{' '}
            public,{' '}
            <span className="font-mono tabular-nums">
              {check.dataset.privateRows.toLocaleString('en-US')}
            </span>{' '}
            private
            {check.dataset.ignoredRows > 0 &&
              `, ${check.dataset.ignoredRows.toLocaleString('en-US')} ignored`}
            .{' '}
            {check.dataset.splitByHost
              ? 'The split comes from your Usage column.'
              : 'Which rows are public is drawn at random when you create the competition.'}
            {check.dataset.labels && ` Labels: ${check.dataset.labels.join(', ')}.`}
          </p>
        )}
      </Section>

      <Section title="Rules">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="deadline"
            label="Deadline"
            hint={`Your time zone: ${timeZone}. 1 hour to 90 days from now.`}
            error={fieldErrors.deadline}
          >
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => {
                setDeadline(event.target.value)
                clearError('deadline')
              }}
              {...errorProps('deadline')}
            />
          </Field>
          <Field
            id="dailyLimit"
            label="Submissions per day"
            hint="Per participant, 1 to 20. The count resets at 00:00 UTC."
            error={fieldErrors.dailyLimit}
          >
            <Input
              id="dailyLimit"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={dailyLimit}
              onChange={(event) => {
                setDailyLimit(event.target.value)
                clearError('dailyLimit')
              }}
              {...errorProps('dailyLimit')}
            />
          </Field>
          <Field
            id="scoreDecimals"
            label="Score decimals"
            hint="Decimals shown on leaderboards, 2 to 6."
            error={fieldErrors.scoreDecimals}
          >
            <Input
              id="scoreDecimals"
              type="number"
              inputMode="numeric"
              min={2}
              max={6}
              value={scoreDecimals}
              onChange={(event) => {
                setScoreDecimals(event.target.value)
                clearError('scoreDecimals')
              }}
              {...errorProps('scoreDecimals')}
            />
          </Field>
          <Field
            id="publicShare"
            label="Public share (%)"
            hint={
              check.state === 'ok' && check.dataset.splitByHost
                ? 'Not used: solution.csv has a Usage column.'
                : 'Share of the answers scored on the public leaderboard, 10 to 50.'
            }
            error={fieldErrors.publicShare}
          >
            <Input
              id="publicShare"
              type="number"
              inputMode="numeric"
              min={10}
              max={50}
              value={publicPercent}
              disabled={check.state === 'ok' && check.dataset.splitByHost}
              onChange={(event) => {
                setPublicPercent(event.target.value)
                clearError('publicShare')
              }}
              {...errorProps('publicShare')}
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-4 border-t border-border pt-6">
        <Button
          type="submit"
          data-testid="create-submit"
          loading={submitting}
          disabled={check.state !== 'ok'}
        >
          Create competition
        </Button>
        {check.state !== 'ok' && (
          <p className="text-sm text-muted-foreground">
            {check.state === 'incomplete'
              ? 'Choose the three files to continue.'
              : 'Fix the problems in the files to continue.'}
          </p>
        )}
      </div>
    </form>
  )
}
