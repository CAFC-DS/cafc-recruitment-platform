CREATE TABLE SHARED_REPORT_LINKS (
    share_token VARCHAR(255) PRIMARY KEY UNIQUE NOT NULL,
    report_id INTEGER NOT NULL,
    share_url VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(255) NOT NULL,
    FOREIGN KEY (report_id) REFERENCES scout_reports(report_id)
);