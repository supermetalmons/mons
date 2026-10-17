CREATE TABLE profile_link_catchup_quarantine (
  login_uid TEXT PRIMARY KEY,
  revision_token TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('invalid-login-uid', 'invalid-record')),
  quarantined_at_ms INTEGER NOT NULL CHECK (
    typeof(quarantined_at_ms) = 'integer'
    AND quarantined_at_ms BETWEEN 0 AND 9007199254740991
  ),
  FOREIGN KEY (login_uid) REFERENCES profile_link_catchup_jobs(login_uid)
    ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE rating_projection_recovery_quarantine (
  operation_id TEXT NOT NULL,
  projection_kind TEXT NOT NULL CHECK (
    projection_kind IN ('event-progress', 'profile-game', 'telegram')
  ),
  revision_token TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('invalid-operation-id', 'invalid-record')),
  quarantined_at_ms INTEGER NOT NULL CHECK (
    typeof(quarantined_at_ms) = 'integer'
    AND quarantined_at_ms BETWEEN 0 AND 9007199254740991
  ),
  PRIMARY KEY (operation_id, projection_kind),
  FOREIGN KEY (operation_id) REFERENCES rating_updates(operation_id)
    ON DELETE CASCADE
) WITHOUT ROWID;
