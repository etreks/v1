-- SQL Schema for Selahe Supabase Integration
-- Run these queries in the Supabase SQL Editor to set up your tables and security policies.

-- 1. Create Selahe Chat Sessions Table
CREATE TABLE IF NOT EXISTS public.selahe_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    messages JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.selahe_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for Sessions
CREATE POLICY "Users can insert their own sessions" ON public.selahe_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own sessions" ON public.selahe_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON public.selahe_sessions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON public.selahe_sessions
    FOR DELETE USING (auth.uid() = user_id);


-- 2. Create Selahe Tasks Table
CREATE TABLE IF NOT EXISTS public.selahe_tasks (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.selahe_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for Tasks
CREATE POLICY "Users can insert their own tasks" ON public.selahe_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own tasks" ON public.selahe_tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" ON public.selahe_tasks
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" ON public.selahe_tasks
    FOR DELETE USING (auth.uid() = user_id);
