-- Fix stuck campaign contacts that are still "calling" but campaign is completed
UPDATE campaign_contacts cc
SET status = 'completed'
FROM campaign_groups cg
WHERE cc.campaign_id = cg.id
  AND cc.status = 'calling'
  AND cg.status = 'completed';

-- Also fix any "calling" contacts in paused/cancelled campaigns
UPDATE campaign_contacts cc
SET status = 'failed'
FROM campaign_groups cg
WHERE cc.campaign_id = cg.id
  AND cc.status = 'calling'
  AND cg.status IN ('paused', 'cancelled', 'draft');
