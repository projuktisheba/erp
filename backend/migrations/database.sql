
-- postgresql://erp_mini_new_user:QmaDNHGpVtdD8sCv40MIvZFono48XZrW@localhost:5432/erp_mini_new_dev_db

-- ==========================================
-- PostgreSQL Database & User Creation Script
-- ==========================================
-- How to run this script:
--   psql -U postgres -f database.sql
-- If shows FATAL:  Peer authentication failed for user "postgres"
--   sudo -i -u postgres
--   psql -f database.sql

-- disconnect
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'erp_mini_new_new_dev_db'
    AND pid <> pg_backend_pid();

-- Drop database if exist
DROP DATABASE IF EXISTS erp_mini_new_dev_db;

-- Drop Role if exist
DROP ROLE IF EXISTS erp_mini_new_user;

-- Create Role
CREATE USER erp_mini_new_user WITH PASSWORD 'QmaDNHGpVtdD8sCv40MIvZFono48XZrW';

-- Create a new database owned by that user
CREATE DATABASE erp_mini_new_dev_db OWNER erp_mini_new_user;

-- Grant all privileges on the database to the user
GRANT ALL PRIVILEGES ON DATABASE erp_mini_new_dev_db TO erp_mini_new_user;

-- (Optional) Verify ownership later:
--   \l   → list databases
--   \du  → list roles/users