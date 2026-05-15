-- BusinessBook — Import VGT Budget FY26 from Excel (K€)
delete from public.budget where bu = 'VGT' and cycle = 'BUD' and pl_key = 'cogs';

insert into public.budget (bu, cycle, pl_key, apr, may, jun, jul, aug, sep, oct, nov, dec, jan, feb, mar)
values
('VGT', 'BUD', 'ns_int',   222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583, 222.583),
('VGT', 'BUD', 'ns_ext',   278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467, 278.467),
('VGT', 'BUD', 'cogs_var', 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779, 154.779),
('VGT', 'BUD', 'cogs_fix',  84.159,  84.159,  84.159,  84.159,  84.159,  84.159,  84.159,  84.139,  84.139,  84.141,  84.142,  84.031),
('VGT', 'BUD', 'rd',       136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437, 136.437),
('VGT', 'BUD', 'sgas',      83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655,  83.655),
('VGT', 'BUD', 'bapa',       0,       0,       0,       0,       0,       0,       0,       0,       0,       0,       0,      93.5)
on conflict (bu, cycle, pl_key)
do update set
  apr = excluded.apr, may = excluded.may, jun = excluded.jun,
  jul = excluded.jul, aug = excluded.aug, sep = excluded.sep,
  oct = excluded.oct, nov = excluded.nov, dec = excluded.dec,
  jan = excluded.jan, feb = excluded.feb, mar = excluded.mar;
