/**
 * /host/new: create a competition. Signed-in users only (the `(protected)`
 * layout shows a sign-in panel otherwise); the action checks the caller again.
 */
import { CreateCompetitionForm } from '../../../../features/create/CreateCompetitionForm'
import { BRAND } from '../../../../constants'

export default function NewCompetitionPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <title>{`Create a competition · ${BRAND}`}</title>
      <h1 className="text-2xl font-semibold text-foreground">Create a competition</h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">
        Upload the data and the answers. Participants see the data, never the answers.
      </p>
      <CreateCompetitionForm />
    </div>
  )
}
