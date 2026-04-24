# MapTap Tracker

A score tracker for [MapTap.gg](https://maptap.gg) — track scores over time, compare players head-to-head, and share with friends.

Built with React + Vite, backed by Supabase, deployed on Vercel.

---

## Setup

### 1. Create the Supabase database

1. Go to [supabase.com](https://supabase.com) and create a free account + new project.
2. Once your project is ready, open the **SQL Editor** and run this schema:

```sql
-- Players table
create table players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now()
);

-- Scores table
create table scores (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid references players(id) on delete cascade not null,
  date        date not null,
  value       integer not null check (value >= 0),
  created_at  timestamptz default now(),
  unique (player_id, date)   -- one score per player per day
);

-- Indexes for fast lookups
create index on scores(player_id);
create index on scores(date);
```

3. Go to **Project Settings → API** and copy:
   - **Project URL**  →  `VITE_SUPABASE_URL`
   - **anon / public key**  →  `VITE_SUPABASE_ANON_KEY`

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> `.env` is in `.gitignore` — it will never be committed. You'll add these as environment variables in Vercel separately (see below).

### 3. Install and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
3. In the **Environment Variables** section, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**.

Vercel will build and deploy automatically. Share the URL with anyone — they'll all read from and write to the same Supabase database.

---

## Project structure

```
maptap-tracker/
├── src/
│   ├── main.jsx          # React entry point
│   ├── App.jsx           # Full UI (individual + compare views)
│   ├── db.js             # All Supabase queries (players + scores)
│   └── supabaseClient.js # Supabase client singleton
├── index.html
├── vite.config.js
├── package.json
├── .env.example
└── .gitignore
```

## Supabase Row Level Security (optional)

By default the anon key has full read/write access. If you want to lock it down later, enable RLS on both tables in Supabase and add policies. For a private friend group the default is fine.
