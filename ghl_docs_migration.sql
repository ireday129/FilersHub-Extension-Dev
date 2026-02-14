-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create the docs_chunks table to store documentation chunks and embeddings
create table if not exists docs_chunks (
  id bigint primary key generated always as identity,
  repo text not null,
  branch text not null,
  path text not null,
  chunk_index integer not null,
  title text,
  content text not null,
  content_hash text,
  url text,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create a unique index to prevent duplicate chunks and support upserts
create unique index if not exists docs_chunks_unique_idx 
  on docs_chunks (repo, branch, path, chunk_index);

-- Create an HNSW index for fast similarity search
create index if not exists docs_chunks_embedding_idx 
  on docs_chunks 
  using hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security (RLS)
alter table docs_chunks enable row level security;

-- Create a policy to allow public read access (for the chatbot/context injection)
create policy "Allow public read access"
  on docs_chunks
  for select
  to public
  using (true);

-- Create a policy to allow service role full access (for the sync/embed scripts)
-- Note: Service role bypasses RLS anyway, but good to be explicit if using authenticated client
create policy "Allow service role full access"
  on docs_chunks
  for all
  to service_role
  using (true)
  with check (true);
