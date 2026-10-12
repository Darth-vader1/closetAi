-- Migration: Add gender column to profiles table
-- Stores styling and silhouette preference ('menswear', 'womenswear', 'unisex')

alter table public.profiles
  add column if not exists gender text default 'unisex'
  check (gender in ('menswear', 'womenswear', 'unisex'));
