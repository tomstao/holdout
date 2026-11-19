# Holdout: competition domain research

> How this was made: a research agent read Kaggle's documentation, Kaggle
> community-competition host pages, Codabench and EvalAI docs, two papers
> on leaderboard probing, the scikit-learn metric docs and the dataset
> license pages, and cited each claim. The decisions it informed are in
> [../spec.md](../spec.md) and [../decisions/](../decisions/).

Researched 2026-11-19. Kaggle's docs and competition pages render in JavaScript, so I read them through a rendering proxy (r.jina.ai). Quotes are from the rendered text. Reference keys like [k-setup] resolve to URLs at the end. "Inference:" marks my own reasoning. "Unverified" marks claims I could not confirm.

## 1. Kaggle competition mechanics (participant side)

**Submission file**

- Hosts upload `sample_submission.csv`, "a template showing the required format" [k-setup].
- The solution needs "an Id column as the first column so the system can map predictions to solutions" [k-setup].
- A typical evaluation page says: "For each `id` in the test set, you must predict the probability of the binary target `y`. The file should contain a header" [k-over].
- Classic competitions take a .csv upload, which "must pass processing to receive a score" [k-comp].

**Validation errors**

- The CLI docs show a failed submission with `Status: ERROR` and `Error: Evaluation Exception: Submission must have 418 rows` [k-cli].
- Custom metrics raise `ParticipantVisibleError` "if you want the user to see the error details" [k-setup].
- Inference: other exceptions are hidden from participants.
- Metric code gets `solution`, `submission` and `row_id_column_name`. It has a 30-minute limit and no internet access [k-setup].
- Unverified: I found no official list of Kaggle's built-in validation messages for missing ids, duplicate ids, NaNs and similar errors.

**Public/private split (matches your design)**

- "In solution.csv, add a column named Usage with values: Public, Private, or Ignored." Example rows: `0,1,Public` / `1,0,Private` / `2,1,Ignored` [k-setup].
- The host UI's "Solution Sampling" panel says "The following leaderboard sampling is based on the 'Usage' column from your file" and shows Public 20% / Private 80% [codelab-img2]. So the public percentage comes from how the rows are labelled, not from a separate setting.
- There is a third value, **Ignored**, which counts toward neither leaderboard. Inference: hosts use it for padding or decoy rows. Holdout should support it.
- The public leaderboard is "based on a sample of test data"; the private one is "the final ranking based on the remainder" [k-comp].

**Daily limit**

- Kaggle's docs say "Submission limits (usually 5 per day) apply to the whole team" [k-comp].
- The host setting's help text reads: "After reaching this limit, participants will need to wait until the next day (UTC) to submit again" [codelab-img1]. The reset is at the UTC day boundary, not a rolling 24 hours.
- Deadlines are "at 11:59 PM UTC on the corresponding day" [k-over].
- Team merges are allowed only if the combined submission count is at most "the number of Submissions per day multiplied by the number of days the competition has been running" [k-rules].

**Final selection**

- The rules template says "You may select up to two (2) Final Submissions for judging" [k-rules]. Hosts can change this with the "Scored Private Submissions" setting ("number of submissions eligible for the final private leaderboard") [codelab-img1].
- Final score: a participant quotes the UI as "The evaluated submission with the best Private Score is used for your final score" [k-d432319].
- If nothing is selected: a participant quoting the rules wrote "the platform will automatically select those which performed the highest on the public leaderboard, unless otherwise communicated" [k-d432319]. An older answer says the same [k-d9551].
- Unverified: I could not find this wording on a current official page. The submissions page needs a login.

**Ranking and ties**

- Kaggle's rules: "Each Submission will be scored and ranked by the evaluation metric… In the event of a tie, the Submission that was entered first… will be the winner" [k-rules].
- A new submission that scores worse than your best is "automatically ignore[d] for the public leaderboard" [k-d9551]. So the public leaderboard shows each team's best score. This is from a forum post, not official docs.
- The leaderboard columns are Team, Members, Score, Entries (count) and Last (time since last submission) [k-lb].
- "Getting Started" competitions use two-month rolling leaderboards [k-comp].

**What participants see about their own submissions**

- For each submission: status, public score, private score (blank until the end), description and date, plus the error reason when it fails [k-cli].
- Participants can download their own past submission files [k-cli].

## 2. Kaggle Community Competitions (host side)

**What the host provides** [k-setup]

- `train.csv`, `test.csv`, `solution.csv` (with Usage) and `sample_submission.csv`.
- An evaluation metric: either "Legacy Metrics" (column mapping, sparse documentation) or "Custom Python Metrics" written in a notebook.
- A sandbox test, with the advice to "ensure a perfect submission yields a perfect score". A submission can be pinned as a "Benchmark" baseline row on the leaderboard.
- Unverified: Kaggle publishes metrics as public notebooks (e.g. [k-metric-ll]), but the notebook code did not render for me, so I have no list of the metrics on offer.

**Configurable settings** [codelab-img1], [codelab]

- Maximum Daily Submission Limit (default 5).
- Scored Private Submissions (default 2).
- Score Decimals to Display (default 5). Its help text: "Shorten scores to deter leaderboard probing or for appearances."
- Maximum Team Size (default 3; "Set to 1 to disable team merging").
- The public/private percentage comes from the Usage column.

**Access** [k-setup]

- Visibility: Public or Private ("only accessible via an invitation URL").
- Who can join: "Anyone", "Only people with a link", or "Restricted email list" (matches domains or emails; notebooks off by default).
- Prizes are capped at $25,000, and the host pays them out.
- Hosts get no hands-on Kaggle support.
- Hosts "cannot download participant email addresses".
- A full rescore needs Kaggle Support.

**Pain points for teachers**

- Phone verification is needed to "Create a Community competition" (Kaggle email quoted in [k-d314687]), and the codelab tells hosts to verify by phone [codelab].
- Participants have historically had to verify a phone number before accepting competition rules [k-d67311] (2017-era thread). SMS often failed in some countries [k-d9551]. Unverified: whether this is still required today.
- Users "not of legal age to form a binding contract" are pointed to a parental-consent process [k-terms]. Inference: this is friction for high-school classes.
- No access to student emails makes matching accounts to a roster harder [k-setup].

## 3. Codabench / CodaLab and EvalAI

**Codabench** [cb-design], [cb-yaml], [cb-lb]

- Two protocols:
  - Result submission: participants upload predictions, and a scoring program compares them with reference data. Pros: "easy to set up and cheap to run". Cons: participants see the test inputs and nothing prevents "manual labelling".
  - Code submission: an ingestion program runs the participant's code on the server.
- Every submission is a .zip bundle [cb-part] and is scored in a Docker image (default `codalab/codalab-legacy:py37`) [cb-docker].
- The scoring program writes `scores.json`, whose keys map to leaderboard columns.
- Public/private works through **phases**, not a row split. A feedback phase scores the validation set. A final phase scores the test set with either `max_submissions: 1` or `auto_migrate_to_this_phase: True`, which re-runs earlier successful submissions on the test set.
- Per-phase limits: `max_submissions`, `max_submissions_per_day`, and `max_submissions_scope` (participant or organization/team).
- Columns have `sorting` (asc/desc) and `precision` (default 2).
- `submission_rule` options include `Force_Last` and `Force_Best` ("the older one is kept, so a new submission only replaces the current one if it scores better").
- Ties are broken by `submitted_at`, with earlier ranked higher.
- Leaderboards can be `hidden`.

**EvalAI** [ev-types], [ev-phases], [ev-splits], [ev-eval], [ev-host]

- Two challenge types: prediction upload (any file format) and code upload.
- The host writes `evaluate(test_annotation_file, user_annotation_file, phase_codename)`, which returns per-split metrics.
- Dataset splits within a phase (e.g. `test_split`) each have `visibility`: 1 host only, 2 host and the submitter, 3 everyone.
- Per phase: `max_submissions_per_day`, `max_submissions_per_month`, `max_submissions`, `is_restricted_to_select_one_submission`, `leaderboard_decimal_precision` (default 2) and `is_leaderboard_order_descending`.
- `show_leaderboard_by_latest_submission` chooses between showing the best or the latest submission.
- Setup goes through a GitHub template, a token and a CI build, and on eval.ai "The challenge will be publicly available once EvalAI admin approves."

**Inference:** worth borrowing: result-submission only, per-split visibility (EvalAI's 1/2/3 maps onto public / private-until-deadline), `Force_Best` with earliest-wins ties, per-team daily limits, per-column precision, baseline rows. Heavy, skip: Docker workers, code submission and ingestion programs, zip/YAML bundles, GitHub/CI setup with admin approval, multi-phase auto-migration. Kaggle's single test set with a Usage split is simpler and fits one Worker.

## 4. Leaderboard integrity

- **The Ladder** (Blum & Hardt 2015) [ladder]
  - Mechanism: release a new score only if it beats the previous best by more than a step η, round it to a multiple of η, and otherwise repeat the old best.
  - A parameter-free variant uses a step of s/√n, where s is the standard deviation of the per-row loss difference from the previous best. It works out to roughly a 0.15-level paired test.
  - The "boosting attack": submit k random label vectors, keep those scoring ≤ 1/2, take their per-coordinate majority. This drives public loss to 1/2 − Ω(√(k/n)).
  - Rounding helps only if it is coarser than about 1/√n. Kaggle's 10⁻⁵ (as of 2015) is far finer.
  - The attack leaves private-set coordinates random, so the private leaderboard stays honest.
- **Whitehill (2015, arXiv)** [whitehill]
  - An AUC oracle leaks labels. In a 4-row example, the reported AUC of 0.75 identifies the exact labelling.
  - A contestant with AUC near 1 can infer some labels with certainty.
  - Brute-force inference is intractable except on tiny sets, because the number of consistent labelings grows exponentially in n.
  - Suggested safeguards: "adding noise to the output of the oracle", "limiting the number of times that a contestant may query the oracle", and "not re-using test examples across competitions."
  - Multi-account abuse to get around daily limits is the other attack named.
- **Empirical evidence:** a meta-analysis of more than 100 Kaggle competitions found "little evidence of substantial overfitting" from public leaderboard reuse (Roelofs et al., NeurIPS 2019) [roelofs].
- Kaggle's own guidance: a private split, daily limits, and "truncating decimals can prevent 'leaderboard probing'" [k-setup], [k-comp].

**Inference: recommendations for a class**

- Worth it: a private split with the final ranking on Private rows only; a per-team daily limit resetting at UTC (or class-local) midnight; 3 to 4 displayed decimals; a stratified public/private split so both parts contain every class (see the AUC edge case in section 5); private scores shown only after the deadline; no test-row reuse between cohorts.
- Optional: a Ladder-style "show the new score only if it beats your best by more than s/√n" rule. Cheap to compute, confusing for beginners.
- Not worth it: noise injection, code submission.
- Small test sets matter: with a public set of n = 200, 1/√n ≈ 0.07, so leaderboard noise and probing are much worse than on Kaggle-sized sets. Warn the host when the public row count is low.

## 5. Metrics

| Metric   | Definition                                                                                                                     | Better | Edge cases                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accuracy | (1/n) Σ 1(ŷᵢ = yᵢ) [skl-guide]                                                                                                 | higher | Labels must match exactly (string vs number type).                                                                                                                                                                                      |
| Macro-F1 | Unweighted mean of per-class F1, where F1 = 2TP/(2TP+FP+FN). Labels default to the sorted union of y_true and y_pred [skl-f1]. | higher | A class absent from both sides is 0/0. The default `zero_division="warn"` scores it 0.0; `np.nan` drops it from the mean [skl-f1]. Inference: compute over the solution's label set so stray predicted labels count as false positives. |
| RMSE     | √MSE, where MSE = (1/n) Σ (yᵢ − ŷᵢ)² [skl-guide]. `root_mean_squared_error` was added in sklearn 1.4 [skl-rmse].               | lower  | Reject NaN/inf.                                                                                                                                                                                                                         |
| MAE      | (1/n) Σ \|yᵢ − ŷᵢ\| [skl-guide]                                                                                                | lower  | Same as RMSE.                                                                                                                                                                                                                           |
| Log loss | −(1/N) Σᵢ Σₖ yᵢₖ log p̂ᵢₖ [skl-guide]                                                                                           | lower  | Clipping differs between sklearn and Kaggle; see below.                                                                                                                                                                                 |
| ROC AUC  | Probability that a random positive is ranked above a random negative; equivalent to the Wilcoxon rank test [fawcett].          | higher | Ties and single-class sets; see below.                                                                                                                                                                                                  |

**Log loss clipping**

- Kaggle (Otto evaluation page): rows "are rescaled prior to being scored (each row is divided by the row sum)" and probabilities are replaced with max(min(p, 1−10⁻¹⁵), 10⁻¹⁵) [k-otto].
- sklearn today:
  - It clips to [eps, 1−eps] with `eps = finfo(dtype).eps`, about 2.2e-16 for float64 [skl-src-cls].
  - The `eps` parameter was deprecated in 1.3 and removed in 1.5 [skl-wn13].
  - Since 1.3, rows that don't sum to 1 trigger a warning and are not renormalized [skl-wn13], [skl-src-cls].
- Inference: one wrong prediction with p ≈ 0 costs about 34.5 nats with Kaggle's clip and about 36 with sklearn's. Pick one, document it, and use Kaggle's 1e-15 plus row renormalization for parity.

**ROC AUC details**

- Ties: Fawcett says tied scores should produce the diagonal, i.e. "the average of the pessimistic and optimistic segments", by "not emitting an ROC point until all instances of equal f values have been processed" [fawcett]. sklearn takes thresholds at distinct score values for the same reason [skl-src-rank]. The effect is half credit for ties.
- Single class: since sklearn 1.6, `roc_auc_score` returns NaN and warns "Only one class is present in y_true" [skl-wn16], [skl-src-rank]. Older versions raised an error.
- Inference: with a small public split this can actually happen. Stratify the split, or refuse to launch if either part is single-class.
- Multiclass needs an explicit `multi_class='ovr'` or `'ovo'` [skl-auc].

## 6. Demo dataset candidates

I delegated the dataset checks to a helper and spot-checked the Penguins README and the Wine Quality license line myself.

**One caveat applies to every candidate below:** the labels are already published, so a participant can look up the test answers.

- Inference: present it as practice, shuffle and re-ID the rows, deduplicate, or synthesize from the originals as Kaggle's Playground series does. Kaggle's own docs advise sourcing "your own private data to prevent cheating" [k-setup], [k-over].

1. **Palmer Penguins**, https://github.com/allisonhorst/palmerpenguins. License: CC0; the README says "Data are available by CC-0 license" (https://creativecommons.org/share-your-work/public-domain/cc0/), and the underlying EDI packages say CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/) per their DataONE metadata copy (EDI itself returned 403). 344 × 8, about 15 KB. Target `species`, 3 classes (152/124/68). Fit: 11 rows with missing values; very easy (scores cluster near 100%) and the test set is tiny.
2. **Wine Quality (UCI #186)**, https://archive.ics.uci.edu/dataset/186/wine+quality. License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode). Red 1,599 × 12, white 4,898 × 12 (about 350 KB). Target `quality` (integers 3 to 9), regression or classification, very imbalanced. Fit: 240 (red) and 937 (white) exact duplicate rows; deduplicate before splitting or they leak between train and test.
3. **Abalone (UCI #1)**, https://archive.ics.uci.edu/dataset/1/abalone. License: CC BY 4.0 (same line). 4,177 × 9, about 192 KB, no header row. Target `Rings` (regression). Fit: clean; two rows have Height = 0.
4. **Bike Sharing (UCI #275)**, https://archive.ics.uci.edu/dataset/275/bike+sharing+dataset. License: CC BY 4.0, citation requested. hour.csv 17,379 × 17 (1.16 MB); day.csv 731 × 16. Target `cnt`. Fit: **leakage**, since `casual + registered == cnt` on every row (drop both); needs a time-based split; Kaggle already ran a competition on it.
5. **NYC 2018 Central Park Squirrel Census**, https://data.cityofnewyork.us/d/vfnx-vebw. License field empty; the NYC FAQ says "There are no restrictions on the use of Open Data" (https://www.nyc.gov/opendata/get-started/FAQs); third-party data. 3,023 × 31. Messy, with leaky color columns. **Skip:** no CC or public-domain license.

**Recommendation:** Penguins (classification), Wine Quality (deduplicated), Abalone (regression).

## Sources

- [k-comp] https://www.kaggle.com/docs/competitions
- [k-setup] https://www.kaggle.com/docs/competitions-setup
- [k-rules] https://www.kaggle.com/competitions/playground-series-s5e8/rules
- [k-over] https://www.kaggle.com/competitions/playground-series-s5e8/overview
- [k-lb] https://www.kaggle.com/competitions/playground-series-s5e8/leaderboard
- [k-cli] https://github.com/Kaggle/kaggle-cli/blob/main/docs/competitions.md
- [k-d9551] https://www.kaggle.com/discussions/getting-started/9551
- [k-d432319] https://www.kaggle.com/discussions/general/432319
- [k-d314687] https://www.kaggle.com/discussions/general/314687
- [k-d67311] https://www.kaggle.com/discussions/product-feedback/67311
- [k-terms] https://www.kaggle.com/terms
- [k-metric-ll] https://www.kaggle.com/code/metric/log-loss
- [k-otto] https://www.kaggle.com/competitions/otto-group-product-classification-challenge/overview/evaluation
- [codelab] https://codelabs.developers.google.com/upskill-with-kaggle
- [codelab-img1] https://codelabs.developers.google.com/static/upskill-with-kaggle/img/5efb6387612db941.png
- [codelab-img2] https://codelabs.developers.google.com/static/upskill-with-kaggle/img/89fa1f42d177505a.png
- [cb-design] https://github.com/codalab/codabench/blob/develop/documentation/docs/Organizers/Benchmark_Creation/Competition-Design.md
- [cb-yaml] https://github.com/codalab/codabench/blob/develop/documentation/docs/Organizers/Benchmark_Creation/Yaml-Structure.md
- [cb-lb] https://github.com/codalab/codabench/blob/develop/documentation/docs/Organizers/Benchmark_Creation/Leaderboard-Functionality.md
- [cb-part] https://github.com/codalab/codabench/blob/develop/documentation/docs/Participants/User_Participating-in-a-Competition.md
- [cb-docker] https://github.com/codalab/codabench/blob/develop/documentation/docs/Organizers/Benchmark_Creation/Competition-docker-image.md
- [ev-types] https://github.com/Cloud-CV/EvalAI/blob/master/docs/source/02-for-challenge-hosts/hosting-guide/challenge-types.md
- [ev-phases] https://github.com/Cloud-CV/EvalAI/blob/master/docs/source/02-for-challenge-hosts/configuration/challenge-phases-setup.md
- [ev-splits] https://github.com/Cloud-CV/EvalAI/blob/master/docs/source/02-for-challenge-hosts/configuration/dataset-splits.md
- [ev-eval] https://github.com/Cloud-CV/EvalAI/blob/master/docs/source/02-for-challenge-hosts/evaluation/evaluation-scripts.md
- [ev-host] https://github.com/Cloud-CV/EvalAI/blob/master/docs/source/02-for-challenge-hosts/hosting-guide/host-challenge.md
- [ladder] https://arxiv.org/abs/1502.04585
- [whitehill] https://arxiv.org/abs/1506.01339
- [roelofs] https://proceedings.neurips.cc/paper/2019/hash/ee39e503b6bedf0c98c388b7e8589aca-Abstract.html
- [fawcett] https://doi.org/10.1016/j.patrec.2005.10.010 (Pattern Recognition Letters 27 (2006) 861–874; text read from https://people.inf.elte.hu/kiss/11dwhdm/roc.pdf)
- [skl-guide] https://scikit-learn.org/stable/modules/model_evaluation.html
- [skl-f1] https://scikit-learn.org/stable/modules/generated/sklearn.metrics.f1_score.html
- [skl-rmse] https://scikit-learn.org/stable/modules/generated/sklearn.metrics.root_mean_squared_error.html
- [skl-auc] https://scikit-learn.org/stable/modules/generated/sklearn.metrics.roc_auc_score.html
- [skl-src-cls] https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/metrics/_classification.py
- [skl-src-rank] https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/metrics/_ranking.py
- [skl-wn13] https://github.com/scikit-learn/scikit-learn/blob/main/doc/whats_new/v1.3.rst
- [skl-wn16] https://github.com/scikit-learn/scikit-learn/blob/main/doc/whats_new/v1.6.rst
