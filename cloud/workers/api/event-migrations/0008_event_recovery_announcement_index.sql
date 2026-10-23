CREATE INDEX idx_event_records_scheduled_sunday_start
ON event_records (status, start_at_ms, event_id)
WHERE status = 'scheduled'
  AND json_type(record_json, '$.isSundayMons') = 'true';
