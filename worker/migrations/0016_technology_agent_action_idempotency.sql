-- Haber 2.0 autonomous-agent action receipts.
-- New publication, edits and state transitions insert their receipt in the
-- SAME D1 transaction as the article/revision changes, not afterward.
--
-- The request key is unique within the human's pairwise site subject, rather
-- than scoped to the agent. Two different agents cannot reuse a key to view
-- or replay each other's actions even if they share a human sponsor.
CREATE TABLE technology_agent_requests (
  subject TEXT NOT NULL,
  request_key TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (subject, request_key)
);
CREATE INDEX technology_agent_requests_created_idx
  ON technology_agent_requests(created_at);
