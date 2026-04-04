#!/usr/bin/env bash
set -euo pipefail

# Contract for the delivery orchestrator:
#   {
#     "agents": [{"agent":"coderabbit","state":"started|completed|findings_detected","findingsCount":1,"note":"..."}],
#     "detected": true|false,
#     "artifact_text": "normalized text artifact",
#     "vendors": ["coderabbit", "qodo"],
#     "comments": [...]
#   }

pr_number="${1:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

if [[ -z "$pr_number" ]]; then
  pr_number="$(gh pr view --json number -q .number)"
fi

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
owner="${repo%%/*}"
name="${repo##*/}"
pr_json="$(gh pr view "$pr_number" --json number,title,url,headRefName,headRefOid,baseRefName,isDraft,state,comments,reviews)"

review_comments_json="$(
  gh api --paginate "repos/$repo/pulls/$pr_number/comments?per_page=100" \
    --jq '.[]'
)"

if [[ -n "$review_comments_json" ]]; then
  review_comments_json="$(printf '%s\n' "$review_comments_json" | jq -s '.')"
else
  review_comments_json='[]'
fi

fetch_review_threads_page() {
  local after_cursor="${1:-}"

  if [[ -n "$after_cursor" ]]; then
    gh api graphql \
      -F owner="$owner" \
      -F name="$name" \
      -F number="$pr_number" \
      -F after="$after_cursor" \
      -f query='
        query($owner: String!, $name: String!, $number: Int!, $after: String) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $after) {
                nodes {
                  id
                  isResolved
                  isOutdated
                  viewerCanResolve
                  comments(first: 100) {
                    nodes {
                      databaseId
                      url
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      '
  else
    gh api graphql \
      -F owner="$owner" \
      -F name="$name" \
      -F number="$pr_number" \
      -f query='
        query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  isOutdated
                  viewerCanResolve
                  comments(first: 100) {
                    nodes {
                      databaseId
                      url
                    }
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      '
  fi
}

fetch_thread_comments_page() {
  local thread_id="$1"
  local after_cursor="${2:-}"

  if [[ -n "$after_cursor" ]]; then
    gh api graphql \
      -F threadId="$thread_id" \
      -F after="$after_cursor" \
      -f query='
        query($threadId: ID!, $after: String) {
          node(id: $threadId) {
            ... on PullRequestReviewThread {
              comments(first: 100, after: $after) {
                nodes {
                  databaseId
                  url
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      '
  else
    gh api graphql \
      -F threadId="$thread_id" \
      -f query='
        query($threadId: ID!) {
          node(id: $threadId) {
            ... on PullRequestReviewThread {
              comments(first: 100) {
                nodes {
                  databaseId
                  url
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      '
  fi
}

review_threads_json='[]'
thread_cursor=""

while :; do
  thread_page_json="$(fetch_review_threads_page "$thread_cursor")"
  thread_nodes_json="$(printf '%s' "$thread_page_json" | jq '.data.repository.pullRequest.reviewThreads.nodes')"

  if [[ "$thread_nodes_json" != "[]" ]]; then
    review_threads_json="$(
      jq -n \
        --argjson existing "$review_threads_json" \
        --argjson nodes "$thread_nodes_json" \
        '$existing + $nodes'
    )"
  fi

  thread_has_next="$(printf '%s' "$thread_page_json" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage // false')"
  if [[ "$thread_has_next" != "true" ]]; then
    break
  fi

  thread_cursor="$(printf '%s' "$thread_page_json" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor // ""')"
done

expanded_review_threads_json='[]'
while IFS= read -r thread_json; do
  [[ -z "$thread_json" ]] && continue

  thread_id="$(printf '%s' "$thread_json" | jq -r '.id')"
  comment_nodes_json="$(printf '%s' "$thread_json" | jq '.comments.nodes // []')"
  comment_has_next="$(printf '%s' "$thread_json" | jq -r '.comments.pageInfo.hasNextPage // false')"
  comment_cursor="$(printf '%s' "$thread_json" | jq -r '.comments.pageInfo.endCursor // ""')"

  while [[ "$comment_has_next" == "true" ]]; do
    comment_page_json="$(fetch_thread_comments_page "$thread_id" "$comment_cursor")"
    page_nodes_json="$(printf '%s' "$comment_page_json" | jq '.data.node.comments.nodes // []')"
    comment_nodes_json="$(
      jq -n \
        --argjson existing "$comment_nodes_json" \
        --argjson nodes "$page_nodes_json" \
        '$existing + $nodes'
    )"
    comment_has_next="$(printf '%s' "$comment_page_json" | jq -r '.data.node.comments.pageInfo.hasNextPage // false')"
    comment_cursor="$(printf '%s' "$comment_page_json" | jq -r '.data.node.comments.pageInfo.endCursor // ""')"
  done

  expanded_thread_json="$(
    printf '%s' "$thread_json" | jq --argjson nodes "$comment_nodes_json" '.comments = { nodes: $nodes }'
  )"
  expanded_review_threads_json="$(
    jq -n \
      --argjson existing "$expanded_review_threads_json" \
      --argjson thread "$expanded_thread_json" \
      '$existing + [$thread]'
  )"
done < <(printf '%s' "$review_threads_json" | jq -c '.[]')

review_threads_json="$expanded_review_threads_json"

jq -n \
  --argjson pr "$pr_json" \
  --argjson review_comments "$review_comments_json" \
  --argjson review_threads "$review_threads_json" '
    def normalize_text:
      tostring
      | gsub("\r"; "")
      | gsub("\\s+"; " ")
      | ascii_downcase;

    def author_login:
      (.author.login // .user.login // "unknown");

    def author_type:
      (.author.type // .user.type // "unknown");

    def body_text:
      (.body // "");

    def looks_like_ai_identity:
      (author_login | ascii_downcase) as $login
      | (author_type | ascii_downcase) as $type
      | ($login | test("qodo|coderabbit|copilot|code-review|ai[-_]?review|review[-_]?bot"))
        or ($type == "bot" and ($login | test("copilot|rabbit|review|ai|qodo")));

    def looks_like_ai_text:
      (body_text | normalize_text) as $body
      | ($body | test("ai code review|automated code review|generated by|copilot|coderabbit|code rabbit|qodo|review bot|suggestion:"));

    def looks_like_started_text:
      (body_text | normalize_text) as $body
      | ($body | test("review started|review in progress|currently reviewing|i am reviewing|i'\''m reviewing|analyzing this pr|analysis in progress|starting review|check back in a few minutes|processing new changes in this pr"));

    def looks_like_summary_noise_text:
      (body_text | normalize_text) as $body
      | ($body | test("review summary by|code review by|walkthroughs|file changes|looking for bugs\\?|finishing touches|summary of changes|rule violations|bugs \\("));

    def vendor_name:
      (author_login | ascii_downcase) as $login
      | (body_text | normalize_text) as $body
      | if ($login | test("coderabbit")) or ($body | test("coderabbit|code rabbit")) then "coderabbit"
        elif ($login | test("qodo")) or ($body | test("qodo")) then "qodo"
        elif ($login | test("copilot")) or ($body | test("copilot")) then "copilot"
        elif looks_like_ai_identity or looks_like_ai_text then
          if $login != "unknown" then $login else "generic-ai-review" end
        else null
        end;

    def enrich_threads:
      $review_threads
      | map(
          . as $thread
          | (.comments.nodes // [])
          | map(
              . + {
                __thread_is_outdated: ($thread.isOutdated // false),
                __thread_is_resolved: ($thread.isResolved // false),
                __thread_id: ($thread.id // null),
                __thread_viewer_can_resolve: ($thread.viewerCanResolve // null)
              }
            )
        )
      | add // [];

    def thread_lookup:
      (enrich_threads)
      | map({
          thread_id: (.__thread_id // null),
          key_db: (if .databaseId then (.databaseId | tostring) else null end),
          key_url: (.url // null),
          is_outdated: .__thread_is_outdated,
          is_resolved: .__thread_is_resolved,
          viewer_can_resolve: (.__thread_viewer_can_resolve // null)
        })
      | map(select(.key_db != null or .key_url != null));

    def comment_thread_state:
      . as $comment
      | (thread_lookup) as $lookup
      | ($lookup
          | map(
              select(
                (.key_db != null and .key_db == (($comment.databaseId // null) | tostring))
                or (.key_url != null and .key_url == ($comment.html_url // $comment.url // ""))
              )
            )
          | .[0]) as $match
      | {
          thread_id: ($match.thread_id // null),
          is_outdated: ($match.is_outdated // false),
          is_resolved: ($match.is_resolved // false),
          viewer_can_resolve: ($match.viewer_can_resolve // null)
        };

    def comment_kind($channel):
      (body_text | normalize_text) as $body
      | if $channel == "inline_review" then
          if (comment_thread_state.is_outdated or comment_thread_state.is_resolved) then "unknown" else "finding" end
        elif $channel == "review_summary" and ($body | length) == 0 then "summary"
        elif looks_like_started_text or looks_like_summary_noise_text then "summary"
        elif looks_like_started_text or looks_like_summary_noise_text then "summary"
        elif ($body | test("summary|overall|overview|high level|high-level|general feedback|looks good|no major issues|quick recap")) then "summary"
        elif ($body | test("should|could|must|consider|missing|bug|issue|incorrect|guard|handle|return|null|undefined|race|rename|suggestion:|nit:|nitpick")) then "finding"
        else "unknown"
        end;

    def derived_agent_state($channel):
      if $channel == "inline_review" then
        if (comment_thread_state.is_outdated or comment_thread_state.is_resolved) then "completed" else "findings_detected" end
      elif looks_like_started_text then "started"
      elif comment_kind($channel) == "finding" then "findings_detected"
      else "completed"
      end;

    def review_entry($channel; $path; $line):
      (vendor_name) as $vendor
      | (comment_thread_state) as $thread_state
      | if $vendor == null then
          empty
        elif $channel == "review_summary" and ((body_text | normalize_text) | length) == 0 then
          empty
        else
          {
            vendor: $vendor,
            channel: $channel,
            author_login: author_login,
            author_type: author_type,
            body: body_text,
            path: $path,
            line: $line,
            thread_id: ($thread_state.thread_id // null),
            thread_viewer_can_resolve: ($thread_state.viewer_can_resolve // null),
            url: (.html_url // .url // ""),
            updated_at: (.updated_at // .submittedAt // .updatedAt // .createdAt // ""),
            is_outdated: ($thread_state.is_outdated // false),
            is_resolved: ($thread_state.is_resolved // false),
            kind: comment_kind($channel),
            derived_state: derived_agent_state($channel)
          }
        end;

    ($pr.comments // [])
    | map(review_entry("issue_comment"; null; null)) as $issue_comments
    | ($pr.reviews // [])
    | map(review_entry("review_summary"; null; null)) as $review_summaries
    | $review_comments
    | map(review_entry("inline_review"; (.path // null); (.line // .original_line // null))) as $inline_comments
    | (
        ($inline_comments | sort_by((.is_outdated // false), (.is_resolved // false), .vendor, .path, .line))
        + ($issue_comments | sort_by(.vendor, .updated_at))
        + ($review_summaries | sort_by(.vendor, .updated_at))
      ) as $matches
    | ($matches | map(.vendor) | unique | sort) as $vendors
    | (
        $matches
        | sort_by(.vendor)
        | group_by(.vendor)
        | map({
            agent: .[0].vendor,
            state:
              (if any(.derived_state == "findings_detected") then "findings_detected"
               elif any(.derived_state == "started") then "started"
               else "completed"
               end),
            findingsCount: (map(select(.derived_state == "findings_detected")) | length),
            note:
              (if any(.derived_state == "findings_detected") then
                 "actionable findings captured"
               elif any(.derived_state == "started") then
                 "review still in progress"
               else
                 "review completed without actionable findings"
               end)
          })
      ) as $agents
    | {
        agents: $agents,
        detected: ($matches | length > 0),
        reviewed_head_sha: ($pr.headRefOid // null),
        artifact_text:
          (
            [
              "PR #\($pr.number): \($pr.title)",
              "URL: \($pr.url)",
              "Branch: \($pr.headRefName) -> \($pr.baseRefName)",
              "Reviewed head SHA: \($pr.headRefOid // "unknown")",
              "State: \($pr.state)\(if $pr.isDraft then " (draft)" else "" end)",
              "Detected AI review comments: \($matches | length)",
              "Detected AI review agents: \($agents | length)",
              "Vendors: \(if ($vendors | length) > 0 then ($vendors | join(", ")) else "none" end)",
              ""
            ]
            + (
              if ($agents | length) > 0 then
                ["Agent states:"]
                + ($agents | map("- \(.agent): \(.state)\(if (.findingsCount // 0) > 0 then \" (\(.findingsCount) findings)\" else \"\" end)"))
                + [""]
              else
                []
              end
            )
            + (
              $matches
              | map(
                  "- [\(.kind)][\(.vendor)][\(.channel)][\(.derived_state)] \(.author_login)"
                  + (if .path then " on \(.path):\(.line // 0)" else "" end)
                  + (if .thread_id then " [thread \(.thread_id)]" else "" end)
                  + (if .is_resolved then " [resolved]" else "" end)
                  + (if .is_outdated then " [outdated]" else "" end)
                  + (if .updated_at != "" then " at \(.updated_at)" else "" end)
                  + "\n  "
                  + (.body | gsub("\r"; "") | gsub("\n"; "\n  "))
                  + (if .url != "" then "\n  \(.url)" else "" end)
                )
            )
          ) | join("\n"),
        vendors: $vendors,
        comments: $matches
      }
  '
