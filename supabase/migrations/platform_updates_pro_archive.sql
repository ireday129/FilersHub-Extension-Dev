ALTER TABLE platform_updates
ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS staff_archived_updates (
    staff_id UUID REFERENCES staff(staff_id) ON DELETE CASCADE,
    update_id UUID REFERENCES platform_updates(update_id) ON DELETE CASCADE,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (staff_id, update_id)
);
