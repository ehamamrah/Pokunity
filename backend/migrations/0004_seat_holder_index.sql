-- v1.1: the detail page reports viewer.blockingReason = HOLD_LIMIT, which needs the viewer's number of
-- active holds. Seats HELD by a member are exactly their active holds (HELD + PAYMENT_PENDING), so the
-- catalog answers it from its own table with an index-only count.
CREATE INDEX seats_held_by_holder_idx ON seats (holder_user_id) WHERE status = 'HELD';
