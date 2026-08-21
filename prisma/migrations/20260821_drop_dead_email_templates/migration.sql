-- Three email templates never fire in code today; removing them
-- from the defaults still left the DB rows behind so the editor kept
-- showing them with "Not wired" badges. Delete the rows so the
-- editor stops listing them. Any customized subject/body a tenant
-- may have written is lost -- these events don't send from any code
-- path so nothing depended on the customization anyway.
DELETE FROM "EmailTemplate"
WHERE "eventKey" IN ('waiver_welcome', 'waiver_confirmed', 'contract_signed');
