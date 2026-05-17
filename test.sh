#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic3VwYXZpc29yIn0.9N8y1ioo8nx8WjE_nw7FH4IzAmdmlAhyrL7YlilHq8U"

# 1. create the postgres container
docker run -d \
  --name pg_x \
  --network cloudisy_server_default \
  -e POSTGRES_USER=x \
  -e POSTGRES_PASSWORD=fahadpass \
  -e POSTGRES_DB=mydb \
  postgres:16-alpine

# 2. wait until postgres is actually ready
echo "Waiting for postgres..."
until docker exec pg_x pg_isready -U x -d mydb; do
  sleep 1
done

# 3. register in supavisor
curl -X PUT http://localhost:4000/api/tenants/x \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "tenant": {
      "db_host": "pg_x",
      "db_port": 5432,
      "db_database": "mydb",
      "ip_version": "auto",
      "enforce_ssl": false,
      "require_user": true,
      "users": [
        {
          "db_user": "x",
          "db_password": "fahadpass",
          "pool_size": 10,
          "mode_type": "transaction",
          "is_manager": true
        }
      ]
    }
  }'

echo ""

# 4. connect
psql "postgres://x.x:fahadpass@localhost:6543/mydb?sslmode=disable"
