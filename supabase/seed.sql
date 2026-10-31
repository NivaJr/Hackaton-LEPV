-- Somente dados fictícios de referência; nenhuma conta Auth ou senha é criada.
insert into public.schools (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Escola Demonstração LEPV')
on conflict (id) do update set name = excluded.name;

insert into public.subjects (id, name, bncc_component, display_order)
values
  ('matematica', 'Matemática', 'MA', 1),
  ('portugues', 'Português', 'LP', 2),
  ('ingles', 'Inglês', 'LI', 3),
  ('historia', 'História', 'HI', 4),
  ('geografia', 'Geografia', 'GE', 5),
  ('biologia', 'Biologia', 'CI', 6)
on conflict (id) do update set
  name = excluded.name,
  bncc_component = excluded.bncc_component,
  display_order = excluded.display_order;
