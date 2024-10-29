#!/bin/bash

# Extract database connection details from DATABASE_URL
# Example: postgres://user:password@host:5432/database
POSTGRES_URL='postgresql://postgres:password@postgres.electric-example-sveltekit-tanstack-electric.orb.local:5432/electric'
POSTGRES_USER=$(echo $POSTGRES_URL | sed -E 's/postgres:\/\/([^:]+):.+/\1/')
POSTGRES_PASSWORD=$(echo $POSTGRES_URL | sed -E 's/postgres:\/\/[^:]+:([^@]+).+/\1/')
POSTGRES_HOST=$(echo $POSTGRES_URL | sed -E 's/postgres:\/\/[^@]+@([^:]+):([0-9]+)\/.+/\1/')
POSTGRES_PORT=$(echo $POSTGRES_URL | sed -E 's/postgres:\/\/[^@]+@[^:]+:([0-9]+)\/.+/\1/')
POSTGRES_DB=$(echo $POSTGRES_URL | sed -E 's/postgres:\/\/[^@]+@[^:]+:[0-9]+\/([^?]+).*/\1/')
DUMP_FILE="your_database_dump.sql"

# Create the database dump
pg_dump -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB > $DUMP_FILE

echo "Database dump created: $DUMP_FILE"