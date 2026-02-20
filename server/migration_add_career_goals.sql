-- Migration: Add career_goal to users and seed random goals
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS career_goal TEXT;

-- Seed random goals for existing users
UPDATE public.users SET career_goal = 'Tailoring Specialist' WHERE id = 1;
UPDATE public.users SET career_goal = 'Digital Trainer' WHERE id = 2;
UPDATE public.users SET career_goal = 'Organic Farmer' WHERE id = 3;
UPDATE public.users SET career_goal = 'Data Entry Specialist' WHERE id = 4;
UPDATE public.users SET career_goal = 'Handicraft Artisan' WHERE id = 5;

-- For any other users, set a default
UPDATE public.users SET career_goal = 'Professional Growth' WHERE career_goal IS NULL;
