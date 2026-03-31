-- Migration: Add vehicle columns to customer_profiles
-- Run in Supabase SQL Editor (https://app.supabase.com)
-- These columns store the vehicle submitted during the prospect survey (Step 3).
-- Safe to run multiple times (IF NOT EXISTS is idempotent).

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS vehicle_year  text,
  ADD COLUMN IF NOT EXISTS vehicle_make  text,
  ADD COLUMN IF NOT EXISTS vehicle_model text;
