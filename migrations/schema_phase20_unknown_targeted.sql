-- Targeted name fixes for the 3 rows that had an osm_operator.
-- 'Alxela' is a typo of the Alexela chain — promoting straight to the brand
-- so it joins the rest of Alexela's stations (loyalty discounts, brand filter, etc.).

update stations set name = 'Eksar-Transoil'
where id = '622cfdf4-7d96-45ab-b30c-61776852c770';

update stations set name = 'Eesti Autogaas'
where id = '606c22ee-b80f-4927-8431-ad7fe69627e7';

update stations set name = 'Alexela'
where id = 'e7f955ce-4ccb-48eb-b3cb-b107105fb392';

-- Identified via external lookup (Gemini): Neste Express Ahtme at Ahtme mnt, Kohtla-Järve.
update stations set name = 'Neste'
where id = '568f6f69-afdd-424d-bca6-dfe690e82422';
