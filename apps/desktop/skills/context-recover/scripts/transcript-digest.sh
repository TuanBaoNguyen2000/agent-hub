#!/bin/sh
# Prints a short digest of a Claude Code or Codex session transcript (JSONL), keeping only what
# happened after a given time: the user's messages, the agent's replies, the tools it called and
# the files it edited. Tool results and file contents are dropped. Output stops at 40 KB.
#
# Usage: sh transcript-digest.sh <transcript.jsonl> <since, ISO 8601: 2026-11-09T10:40:00Z or
#        2026-11-09T17:40:00+07:00>
# Needs jq 1.6 or newer (macOS 15+ ships /usr/bin/jq). Reads only the file it is given.

set -eu

MAX_BYTES=40000
TEXT_CHARS=1500
TOOL_CHARS=240

if [ "$#" -ne 2 ]; then
  echo "usage: sh transcript-digest.sh <transcript.jsonl> <since ISO 8601>" >&2
  exit 2
fi
file=$1
since=$2

if ! command -v jq >/dev/null 2>&1; then
  echo "transcript-digest: jq not found; filter by hand (see SKILL.md)" >&2
  exit 3
fi
if [ ! -f "$file" ]; then
  echo "transcript-digest: no such file: $file" >&2
  exit 2
fi

digest=$(jq -r -R --arg since "$since" --argjson text "$TEXT_CHARS" --argjson tool "$TOOL_CHARS" '
  # ISO 8601 with Z, +hh:mm or +hhmm, with or without fractions, to epoch seconds.
  def epoch:
    capture("^(?<base>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?)(\\.[0-9]+)?(?<zone>Z|[+-][0-9]{2}:?[0-9]{2})?$")
    | (if (.base | length) == 16 then .base + ":00" else .base end) as $base
    | ($base + "Z" | fromdateiso8601) as $utc
    | if (.zone == null or .zone == "Z") then $utc
      else (.zone | capture("(?<sign>[+-])(?<h>[0-9]{2}):?(?<m>[0-9]{2})")) as $z
        | (($z.h | tonumber) * 3600 + ($z.m | tonumber) * 60) as $offset
        | if $z.sign == "+" then $utc - $offset else $utc + $offset end
      end;
  def cut($n): if length > $n then .[0:$n] + " …[cut]" else . end;
  def oneline: gsub("\\s+"; " ") | ltrimstr(" ");
  def clock: .[11:19];
  # Files named in an apply_patch body.
  def patched: [scan("\\*\\*\\* (?:Add|Update|Delete) File: ([^\\n\\\\\"]+)") | .[0]];

  ($since | epoch) as $from
  | fromjson? // empty
  | select(type == "object")
  | (.timestamp // "") as $ts
  | select($ts != "" and (($ts | epoch?) // 0) > $from)
  | ($ts | clock) as $at

  # Claude Code: {type: user|assistant, message: {content: string | [blocks]}}
  | if (.type == "user" and .message != null and (.isMeta // false) == false) then
      (.message.content) as $c
      | if ($c | type) == "string" then
          ($c | select(startswith("<") | not) | "[\($at)] USER: " + (oneline | cut($text)))
        else
          ($c[]? | select(.type == "text") | .text | select(startswith("<") | not)
            | "[\($at)] USER: " + (oneline | cut($text)))
        end
    elif (.type == "assistant" and .message != null) then
      .message.content[]?
      | if .type == "text" then "[\($at)] AGENT: " + (.text | oneline | cut($text))
        elif .type == "tool_use" then
          (.input // {}) as $in
          | if ($in.file_path // $in.notebook_path) != null and (.name | test("^(Write|Edit|MultiEdit|NotebookEdit)$"))
            then "[\($at)] EDIT \($in.file_path // $in.notebook_path)"
            else "[\($at)] TOOL \(.name): " + (($in.command // $in.description // $in.file_path // $in.pattern // $in.url // $in.query // ($in | tostring)) | tostring | oneline | cut($tool))
            end
        else empty end

    # Codex: {type: response_item, payload: {type: message | function_call | custom_tool_call}}
    elif (.type == "response_item" and .payload != null) then
      .payload as $p
      | if $p.type == "message" and $p.role == "user" then
          ($p.content[]? | select(.type == "input_text") | .text | select(startswith("<") | not)
            | "[\($at)] USER: " + (oneline | cut($text)))
        elif $p.type == "message" and $p.role == "assistant" then
          ($p.content[]? | select(.type == "output_text") | "[\($at)] AGENT: " + (.text | oneline | cut($text)))
        elif $p.type == "function_call" or $p.type == "custom_tool_call" then
          (($p.arguments // $p.input // "") | tostring) as $body
          | ($body | patched) as $files
          | if ($files | length) > 0 then ($files[] | "[\($at)] EDIT \(.)")
            else "[\($at)] TOOL \($p.name // "tool"): " + ($body | oneline | cut($tool)) end
        else empty end
    else empty end
' "$file")

if [ -z "$digest" ]; then
  echo "No user messages, replies or tool calls after $since in this transcript."
  exit 0
fi

edited=$(printf '%s\n' "$digest" | sed -n 's/^\[[^]]*\] EDIT //p' | sort -u)
size=$(printf '%s\n' "$digest" | wc -c | tr -d ' ')

echo "# Transcript digest after $since"
echo
if [ "$size" -gt "$MAX_BYTES" ]; then
  # Keep the end: it holds where the session stopped.
  echo "[Earlier part cut: the digest was $size bytes; showing the last $MAX_BYTES.]"
  printf '%s\n' "$digest" | tail -c "$MAX_BYTES" | sed '1d'
else
  printf '%s\n' "$digest"
fi
if [ -n "$edited" ]; then
  echo
  echo "## Files edited or created"
  printf '%s\n' "$edited" | sed 's/^/- /'
fi
