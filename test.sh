#!/bin/bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-CHANGE_ME}"

REQUEST_BODY='{"username":"x","ram":512,"cpu":0.5}'

echo "Queueing database provisioning..."
CREATE_RESPONSE=$(curl -sS -X POST "${API_URL}/api/databases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "${REQUEST_BODY}")

echo "Create response: ${CREATE_RESPONSE}"
JOB_ID=$(python -c 'import json,sys; print(json.loads(sys.argv[1])["jobId"])' "${CREATE_RESPONSE}")

echo "Polling job ${JOB_ID}..."
for _ in $(seq 1 60); do
  STATUS_RESPONSE=$(curl -sS -X GET "${API_URL}/api/databases/status/${JOB_ID}" \
    -H "Authorization: Bearer ${TOKEN}")

  STATUS=$(python -c 'import json,sys; print(json.loads(sys.argv[1]).get("status",""))' "${STATUS_RESPONSE}")
  echo "Status: ${STATUS}"

  if [ "${STATUS}" = "ready" ]; then
    CONNECTION_URL=$(python -c 'import json,sys; print(json.loads(sys.argv[1]).get("connectionUrl",""))' "${STATUS_RESPONSE}")
    echo "Connection URL: ${CONNECTION_URL}"
    exit 0
  fi

  if [ "${STATUS}" = "failed" ]; then
    ERROR_MESSAGE=$(python -c 'import json,sys; print(json.loads(sys.argv[1]).get("error",""))' "${STATUS_RESPONSE}")
    echo "Provisioning failed: ${ERROR_MESSAGE}"
    exit 1
  fi

  sleep 2
done

echo "Provisioning timed out"
exit 1
