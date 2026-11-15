-- Durable idempotency receipts for human newsroom mutations. The receipt and
-- the article/revision modification are committed by the same D1 batch.
-- A retry with the same (subject,key,fingerprint) returns the original result;
-- a changed payload under the same key is rejected, without any mutation.
CREATE TABLE newsroom_admin_requests (
  orbit_subject TEXT NOT NULL,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (orbit_subject, request_key)
);
CREATE INDEX newsroom_admin_requests_created ON newsroom_admin_requests(created_at);
