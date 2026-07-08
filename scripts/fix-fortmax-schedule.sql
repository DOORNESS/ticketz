-- Corrige horário do WhatsApp principal: 08:00–17:00 (estava 18:00)
UPDATE ticketz."Whatsapps"
SET "outOfHoursMessage" = replace("outOfHoursMessage", '08:00 às 18:00', '08:00 às 17:00')
WHERE id = 1
  AND "outOfHoursMessage" LIKE '%08:00 às 18:00%';
