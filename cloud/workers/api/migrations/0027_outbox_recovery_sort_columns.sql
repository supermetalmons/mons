ALTER TABLE automatch_telegram_projection_outbox
ADD COLUMN recovery_sort_rank INTEGER GENERATED ALWAYS AS (
  CASE json_type(payload_json, '$.updatedAtMs')
    WHEN 'false' THEN 1 WHEN 'true' THEN 2
    WHEN 'integer' THEN 3 WHEN 'real' THEN 3 WHEN 'text' THEN 4
    WHEN 'array' THEN 5 WHEN 'object' THEN 5 ELSE 0
  END
) VIRTUAL;

ALTER TABLE automatch_telegram_projection_outbox
ADD COLUMN recovery_sort_value GENERATED ALWAYS AS (
  CASE WHEN recovery_sort_rank IN (3, 4)
    THEN json_extract(payload_json, '$.updatedAtMs') END
) VIRTUAL;

ALTER TABLE automatch_telegram_projection_outbox
ADD COLUMN recovery_key_integer INTEGER GENERATED ALWAYS AS (
  CASE WHEN length((CASE WHEN substr(record_key, 1, 1) = '-' THEN substr(record_key, 2) ELSE record_key END)) BETWEEN 1 AND 10
    AND (CASE WHEN substr(record_key, 1, 1) = '-' THEN substr(record_key, 2) ELSE record_key END) NOT GLOB '*[^0-9]*'
    AND CAST(record_key AS INTEGER) BETWEEN -2147483648 AND 2147483647
    THEN CAST(record_key AS INTEGER) END
) VIRTUAL;

ALTER TABLE automatch_telegram_projection_outbox
ADD COLUMN recovery_key_rank INTEGER GENERATED ALWAYS AS (
  CASE WHEN recovery_key_integer IS NULL THEN 1 ELSE 0 END
) VIRTUAL;

ALTER TABLE automatch_telegram_projection_outbox
ADD COLUMN recovery_key_length INTEGER GENERATED ALWAYS AS (
  CASE WHEN recovery_key_integer IS NOT NULL THEN length(record_key) ELSE 0 END
) VIRTUAL;

CREATE INDEX idx_automatch_telegram_projection_recovery
ON automatch_telegram_projection_outbox (
  recovery_sort_rank, recovery_sort_value,
  recovery_key_rank, recovery_key_integer, recovery_key_length,
  record_key COLLATE BINARY
)
WHERE payload_json IS NOT NULL;

ALTER TABLE game_session_projection_outbox
ADD COLUMN recovery_sort_rank INTEGER GENERATED ALWAYS AS (
  CASE json_type(payload_json, '$.lastQueuedAtMs')
    WHEN 'false' THEN 1 WHEN 'true' THEN 2
    WHEN 'integer' THEN 3 WHEN 'real' THEN 3 WHEN 'text' THEN 4
    WHEN 'array' THEN 5 WHEN 'object' THEN 5 ELSE 0
  END
) VIRTUAL;

ALTER TABLE game_session_projection_outbox
ADD COLUMN recovery_sort_value GENERATED ALWAYS AS (
  CASE WHEN recovery_sort_rank IN (3, 4)
    THEN json_extract(payload_json, '$.lastQueuedAtMs') END
) VIRTUAL;

ALTER TABLE game_session_projection_outbox
ADD COLUMN recovery_key_integer INTEGER GENERATED ALWAYS AS (
  CASE WHEN length((CASE WHEN substr(record_key, 1, 1) = '-' THEN substr(record_key, 2) ELSE record_key END)) BETWEEN 1 AND 10
    AND (CASE WHEN substr(record_key, 1, 1) = '-' THEN substr(record_key, 2) ELSE record_key END) NOT GLOB '*[^0-9]*'
    AND CAST(record_key AS INTEGER) BETWEEN -2147483648 AND 2147483647
    THEN CAST(record_key AS INTEGER) END
) VIRTUAL;

ALTER TABLE game_session_projection_outbox
ADD COLUMN recovery_key_rank INTEGER GENERATED ALWAYS AS (
  CASE WHEN recovery_key_integer IS NULL THEN 1 ELSE 0 END
) VIRTUAL;

ALTER TABLE game_session_projection_outbox
ADD COLUMN recovery_key_length INTEGER GENERATED ALWAYS AS (
  CASE WHEN recovery_key_integer IS NOT NULL THEN length(record_key) ELSE 0 END
) VIRTUAL;

CREATE INDEX idx_game_session_projection_recovery
ON game_session_projection_outbox (
  recovery_sort_rank, recovery_sort_value,
  recovery_key_rank, recovery_key_integer, recovery_key_length,
  record_key COLLATE BINARY
)
WHERE payload_json IS NOT NULL;
