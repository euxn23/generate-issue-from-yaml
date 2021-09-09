import { readFile } from 'fs/promises'
import { setTimeout } from 'timers/promises'
import YAML from 'yaml'
import { Octokit } from '@octokit/rest'

type Issue = {
  title: string
  point: number
  comment?: string
  assignees?: string[]
  labels: string[]
}

type IssueInput =
  | number
  | {
      point: number
      comment: string
      assignees: string[]
    }
  | {
      point: number
      comment: string
      assignees?: string[]
    }
  | {
      point: number
      comment?: string
      assignees: string[]
    }

type Value = Array<unknown> | IssueInput
type KeyValue = [string, Value]

function assertsValue(maybeValue: unknown): asserts maybeValue is Value {
  if (Array.isArray(maybeValue)) {
    return
  }
  if (isIssueInput(maybeValue)) {
    return
  }
  throw new Error('invalid input')
}

function isOneKeyedRecord(maybeOneKeyedRecord: unknown): boolean {
  return (
    typeof maybeOneKeyedRecord === 'object' &&
    maybeOneKeyedRecord !== null &&
    Object.keys(maybeOneKeyedRecord).length === 1
  )
}

function assertsOneKeyedRecord(
  maybeOneKeyedRecord: unknown
): asserts maybeOneKeyedRecord is Record<string, unknown> {
  if (!isOneKeyedRecord(maybeOneKeyedRecord)) {
    throw new Error('invalid input')
  }
}

function parseOneKeyedRecordToKeyValue(record: unknown): KeyValue {
  assertsOneKeyedRecord(record)
  const entries = Object.entries(record)
  return entries[0] as KeyValue
}

function isIssueInput(
  maybeIssueInput: IssueInput | unknown
): maybeIssueInput is IssueInput {
  if (Number.isSafeInteger(maybeIssueInput)) {
    return true
  }
  if (typeof maybeIssueInput === 'object' && maybeIssueInput !== null) {
    if (
      'point' in maybeIssueInput &&
      ('comment' in maybeIssueInput || 'assignees' in maybeIssueInput)
    ) {
      return true
    }
  }
  return false
}

function assertsIssueInput(
  maybeIssueInput: IssueInput | unknown
): asserts maybeIssueInput is IssueInput {
  if (!isIssueInput(maybeIssueInput)) {
    throw new Error('invalid input')
  }
}

function resolveValue(
  key: string,
  value: Value,
  labels: string[],
  issues: Array<Issue>
): Array<Issue> {
  if (Array.isArray(value)) {
    return [
      ...issues,
      ...value
        .map((oneKeyedRecord) => {
          const [key_, value_] = parseOneKeyedRecordToKeyValue(oneKeyedRecord)
          return resolveValue(key_, value_, [...labels, key], issues)
        })
        .flat(),
    ]
  }
  assertsIssueInput(value)
  const title = labels[0] ? `[${labels[0]}] ${key}` : key
  if (typeof value === 'number') {
    return [...issues, { title, point: value, labels: labels }]
  }
  return [
    ...issues,
    {
      title,
      point: value.point,
      comment: value.comment,
      assignees: value.assignees,
      labels: labels,
    },
  ]
}

async function main() {
  const { GITHUB_TOKEN, OWNER, REPO } = process.env

  if (!GITHUB_TOKEN || !OWNER || !REPO) {
    throw new Error('$GITHUB_TOKEN, $OWNER, $REPO are required.')
  }

  const text = await readFile('input.yaml', 'utf-8')
  const parsed = YAML.parse(text)
  const issues = Object.entries(parsed)
    .map(([key, value]) => {
      assertsValue(value)
      return resolveValue(key, value, [], [])
    })
    .flat()
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
  for (const issue of issues) {
    await octokit.issues.create({
      owner: OWNER,
      repo: REPO,
      title: issue.title,
      body: issue.comment,
      assignees: issue.assignees,
      labels: [...issue.labels, `point:${issue.point}`],
    })
    await setTimeout(500)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
