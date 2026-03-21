-- Leaderboard Feature Migration
-- Adds opt-in column for founder leaderboard visibility

-- Add show_on_leaderboard column to member_founder_profiles table
ALTER TABLE member_founder_profiles 
ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN DEFAULT false;

-- Create index for efficient leaderboard queries
CREATE INDEX IF NOT EXISTS idx_founder_profiles_leaderboard 
ON member_founder_profiles(show_on_leaderboard, total_commissions_earned DESC) 
WHERE show_on_leaderboard = true AND status = 'active';

-- Update RLS policy to allow founders to read leaderboard data (only opted-in founders)
-- This policy allows any authenticated user to see basic leaderboard info for opted-in founders
DROP POLICY IF EXISTS "Anyone can view leaderboard founders" ON member_founder_profiles;
CREATE POLICY "Anyone can view leaderboard founders" ON member_founder_profiles
    FOR SELECT 
    USING (show_on_leaderboard = true AND status = 'active');
