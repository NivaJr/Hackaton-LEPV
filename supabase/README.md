# Supabase — fundação de identidade e permissões

Esta pasta contém uma migração para um projeto Supabase vazio, configuração de desenvolvimento e um seed sem contas. Ela prepara os quatro papéis e os vínculos usados para autorizar acesso aos alunos. A aplicação ainda precisa receber a URL/chave pública do projeto e as contas de demonstração.

## Arquivos e aplicação

- `migrations/20261030220000_foundation.sql`: esquema, chaves, índices, triggers, grants e RLS.
- `seed.sql`: uma escola fictícia e as seis matérias; não cria usuários Auth, senhas, notas ou dados de saúde.
- `config.toml`: configuração local, PostgreSQL 15, autenticação por contas provisionadas e cadastro público desativado.

Em uma instalação local com Supabase CLI e Docker disponíveis:

```sh
supabase start
supabase db reset
```

`db reset` é destrutivo para o banco local: usar apenas no ambiente de desenvolvimento. Em um projeto remoto vazio, aplicar a migração pelo fluxo de migrações da equipe ou executar seu conteúdo no SQL Editor como administrador e, depois, o `seed.sql`. Não reaplicar manualmente a migração em um banco onde ela já foi executada; ela não é um script de atualização idempotente. O seed pode ser reexecutado.

Para banco existente, revisar colisões de tabelas/tipos e produzir uma migração de adaptação antes de aplicar. Os arquivos não foram executados contra uma instância Supabase nesta entrega.

## Contratos das tabelas

| Tabela | Campos principais | Uso |
| --- | --- | --- |
| `schools` | `id`, `name` | Escola; criação somente no provisionamento administrativo |
| `profiles` | `id`, `school_id`, `full_name` | `id` referencia o usuário em `auth.users` |
| `user_roles` | `user_id`, `school_id`, `role` | Enum `aluno`, `coordenador`, `professor`, `responsavel`; uma conta pode possuir mais de um papel |
| `subjects` | `id`, `name`, `bncc_component`, `display_order` | Catálogo fixo; IDs `matematica`, `portugues`, `ingles`, `historia`, `geografia`, `biologia` |
| `classrooms` | `id`, `school_id`, `name`, `grade`, `school_year` | Série permitida: 6 a 9 |
| `enrollments` | `student_id`, `classroom_id`, `school_id`, `status`, `started_at`, `ended_at` | Uma matrícula ativa por estudante; estados `active`, `transferred`, `inactive` |
| `teacher_assignments` | `teacher_id`, `classroom_id`, `subject_id`, `school_id` | Matéria lecionada pelo professor em cada turma |
| `guardian_links` | `guardian_id`, `student_id`, `school_id`, `status` | Estados `pending`, `confirmed`, `revoked`; só `confirmed` autoriza acesso do responsável |
| `student_preferences` | `student_id`, `school_id`, `interests` (`text[]`), `context`, `version` | Ficha do aluno; versão incrementada pelo banco |
| `academic_history` | `id`, `student_id`, `school_id`, `subject_id`, `school_year`, `period`, `grade`, `notes` | Nota opcional de 0 a 10; autoria e datas geridas pelo banco |
| `student_health` | `student_id`, `school_id`, `details` | Saúde, separada da ficha de interesses |
| `student_support` | `student_id`, `school_id`, `details` | Necessidades de apoio |

O nome de navegação Biologia está associado ao componente BNCC Ciências. O catálogo de habilidades e seus códigos ainda não estão carregados nesta fundação.

`profiles` e `user_roles` são compatíveis com consultas da autenticação que selecionam `profiles.id, school_id, full_name` e `user_roles.role, user_id, school_id`.

## Autorizações aplicadas

- Anônimo: nenhum acesso às tabelas desta base.
- Conta autenticada sem perfil provisionado: não recebe acesso à escola ou aos dados dos estudantes.
- Aluno: consulta seus dados e edita a própria ficha; não modifica o próprio papel, a escola ou o vínculo de matrícula.
- Professor: consulta estudantes de turmas em que está alocado; edita histórico apenas da matéria atribuída naquela turma, enquanto a matrícula estiver ativa.
- Responsável: consulta somente estudantes com vínculo confirmado; pode inserir e editar saúde e apoio desses estudantes. Um vínculo pendente ou revogado não autoriza acesso.
- Coordenador: consulta estudantes da própria escola e administra suas turmas, matrículas, atribuições de professores, confirmação/revogação de vínculos e histórico escolar. Não recebe edição de saúde/apoio apenas por ser coordenador.
- `service_role`/administrador: provisiona escolas, perfis e papéis. Essa chave não pode ir ao navegador. Toda rota que a utilize precisa autenticar o solicitante e conferir seu papel/escola antes do provisionamento; RLS não protege operações que usam esse papel privilegiado.

“Todos os perfis visualizam saúde e apoio” significa todos os perfis com vínculo autorizado ao estudante, e não todos os usuários da escola. Ranking, amizades e colegas não ampliam esse acesso. A ficha de interesses só pode ser consultada pelo próprio aluno nesta base, alinhada à regra do domínio TypeScript. A consulta dessa ficha por outros perfis vinculados continua sendo uma proposta não habilitada.

As FKs compostas impedem vincular professor, responsável, estudante ou turma de escolas diferentes. Os triggers conferem que usuários referenciados possuem o papel apropriado. Grants por coluna impedem alterações de IDs/escola/papéis por clientes autenticados. Alterar `user_metadata` ou o papel enviado em um formulário não concede permissões.

Os helpers de autorização ficam no schema não exposto `app_private`, têm `SECURITY DEFINER`, consultas estáticas e `search_path` fixo com referências qualificadas. Foram projetados para pertencer ao papel administrativo que aplica a migração e consulta as tabelas sem recursão de RLS. Não mudar o dono, conceder edição desses helpers ou habilitar `FORCE ROW LEVEL SECURITY` sem revisar o desenho.

## Bootstrap de quatro contas de demonstração

1. Aplicar migração e seed.
2. Criar quatro contas em **Authentication > Users** no projeto Supabase de desenvolvimento. Definir as credenciais nessa interface; nenhuma senha deve ser adicionada ao seed, Git ou `PROMPTS/`.
3. Usar emails de demonstração controlados pela equipe. No SQL abaixo, substituir os quatro emails fictícios pelos emails dessas contas **já existentes**. A conta Auth isolada não recebe papel automaticamente.
4. Executar o SQL como administrador no SQL Editor. Ele interrompe a transação se faltar alguma conta. O vínculo de responsável é confirmado aqui exclusivamente para dados fictícios de demonstração; no produto, o coordenador deve verificar o vínculo antes de confirmá-lo.

```sql
begin;

do $$
declare
  school uuid := '11111111-1111-4111-8111-111111111111';
  coordinator uuid;
  teacher uuid;
  student uuid;
  guardian uuid;
  demo_class uuid := '22222222-2222-4222-8222-222222222222';
begin
  select id into coordinator from auth.users where email = 'coordenador@exemplo.com';
  select id into teacher from auth.users where email = 'professor@exemplo.com';
  select id into student from auth.users where email = 'aluno@exemplo.com';
  select id into guardian from auth.users where email = 'responsavel@exemplo.com';

  if coordinator is null or teacher is null or student is null or guardian is null then
    raise exception 'Crie as quatro contas Auth e substitua os emails antes de executar.';
  end if;
  if not exists (select 1 from public.schools where id = school) then
    raise exception 'Execute o seed da escola antes do bootstrap.';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id in (coordinator, teacher, student, guardian) and p.school_id <> school
  ) then
    raise exception 'Uma conta já pertence a outra escola; não mover automaticamente.';
  end if;

  insert into public.profiles (id, school_id, full_name)
  values
    (coordinator, school, 'Coordenador Demonstração'),
    (teacher, school, 'Professor Demonstração'),
    (student, school, 'Aluno Demonstração'),
    (guardian, school, 'Responsável Demonstração')
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, school_id, role)
  values
    (coordinator, school, 'coordenador'),
    (teacher, school, 'professor'),
    (student, school, 'aluno'),
    (guardian, school, 'responsavel')
  on conflict do nothing;

  insert into public.classrooms (id, school_id, name, grade, school_year)
  values (demo_class, school, '6º A — Demonstração', 6, 2026)
  on conflict (id) do nothing;

  insert into public.enrollments (school_id, classroom_id, student_id)
  select school, demo_class, student
  where not exists (
    select 1 from public.enrollments e where e.student_id = student and e.status = 'active'
  );

  insert into public.teacher_assignments (school_id, classroom_id, teacher_id, subject_id)
  values (school, demo_class, teacher, 'matematica')
  on conflict (classroom_id, teacher_id, subject_id) do nothing;

  insert into public.guardian_links (school_id, guardian_id, student_id, status)
  values (school, guardian, student, 'confirmed')
  on conflict (guardian_id, student_id) do update set status = 'confirmed';
end;
$$;

commit;
```

O bootstrap não altera senhas, não cria contas Auth e não troca a escola de um perfil existente. Para outras séries/turmas, repetir a criação de turma e o provisionamento com IDs/nomes próprios.

## Uso pelos módulos

- Cadastro de aluno/professor/responsável: chamar uma rota administrativa autenticada que valida o coordenador e sua escola antes de usar o provisionamento privilegiado; criar a conta Auth/perfil/papel não deve ser uma inserção aberta ao navegador.
- Primeiro acesso: o callback de convite e a definição de senha com sessão validada já estão implementados no módulo de autenticação. Falta implementar o envio administrativo do convite após o provisionamento. Digitar um email cadastrado não basta para definir a senha de uma conta.
- Ficha: `INSERT` inicial com `student_id`, `school_id`, `interests`, `context`; depois `UPDATE` somente de `interests`/`context`, filtrado pelo estudante. Não enviar `version` ou identidades em um upsert genérico: a versão é controlada pelo banco e as colunas de identidade não têm permissão de atualização.
- Histórico: inserir registro com estudante, matéria, período, ano e nota/comentário; atualizar apenas `school_year`, `period`, `grade`, `notes`. Mudar estudante ou matéria de um registro exige uma operação administrativa específica futura.
- Saúde/apoio: inserir registro inicial pelo responsável confirmado e atualizar somente `details`. Limpar o texto é permitido; apagar o registro não está concedido aos clientes.
- Transferência: o backend deve exigir a confirmação solicitada pelo coordenador e executar em transação: encerrar matrícula antiga com `status = 'transferred', ended_at = now()` e inserir a nova. A base impede duas matrículas ativas, mas não implementa a rota transacional ou a pergunta de confirmação da interface.
- Revogação: mudar o vínculo do responsável para `revoked` ou remover a atribuição do professor retira o acesso correspondente. Papéis administrativos permanecem independentes dos vínculos.

## Verificações necessárias em uma instância real

Aplicar a migração em ambiente descartável e testar com sessões reais das quatro contas e de uma segunda escola. Leituras bloqueadas por RLS normalmente retornam zero linhas; atualizações bloqueadas podem afetar zero linhas ou falhar. A interface deve tratar ambos os resultados e não declarar sucesso apenas por ausência de erro.

| Caso | Resultado esperado |
| --- | --- |
| Aluno consulta próprio perfil, papel e ficha | Permitido |
| Aluno altera `user_roles` ou `profiles.school_id` | Negado por grant/política |
| Aluno edita ficha de outro estudante | Negado |
| Professor de Matemática consulta aluno da própria turma | Permitido |
| Esse professor insere/edita histórico de Matemática | Permitido |
| Esse professor edita histórico de Português ou aluno de outra turma | Negado |
| Responsável confirmado consulta e edita saúde/apoio do filho | Permitido |
| Responsável pendente, revogado ou sem vínculo consulta saúde/apoio | Negado |
| Coordenador consulta saúde/apoio e edita histórico da própria escola | Permitido |
| Coordenador sem papel adicional de responsável edita saúde/apoio | Negado |
| Qualquer perfil tenta vincular IDs de outra escola | Negado por FK e/ou RLS |
| Usuário modifica metadados Auth para se chamar coordenador | Não concede o papel |
| Anônimo consulta qualquer tabela desta base | Negado |

Para conferir SQL como uma identidade no SQL Editor administrativo, usar uma transação descartável e substituir o UUID por uma conta de teste real:

```sql
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"UUID_REAL_DA_CONTA_DE_TESTE","role":"authenticated"}',
  true
);
select id, school_id, full_name from public.profiles;
select user_id, school_id, role from public.user_roles;
-- Executar aqui uma operação do caso de teste, sem dados reais.
rollback;
```

Esse recurso do SQL Editor é uma simulação administrativa, não um mecanismo de login da aplicação. Uma sessão de teste por vez; usar `rollback` mesmo quando a operação for permitida. Testes de rejeição que lançam erro abortam a transação e também exigem rollback.

## Extensões que não estão nesta migração

As próximas migrações devem adicionar catálogo BNCC, arquivos privados/listas PDF e DOCX, questões originais e variantes, atividades/slots semanais, tentativas, recuperação, livro de pontos, frequência e conexões. Cada uma precisa de RLS, índices e contratos próprios, incluindo proteção do gabarito. Esta base não cria buckets públicos, não libera `storage.objects`, não atribui pontos, não aprova o teto sugerido e não anuncia a integração de LLM como pronta.

`updated_by` e `updated_at` registram o último autor da alteração; não constituem um histórico completo de versões. O armazenamento das versões antigas da ficha e a trilha completa de auditoria são extensões futuras.

A migração e o seed reais são executados em `tests/database.test.ts` no PostgreSQL/WASM PGlite, com esquema Auth mínimo emulado. Os testes verificam permissões, vínculos, isolamento, grants, auditoria e versão da ficha sob papéis não proprietários. Não há validação contra Supabase hospedado: PostgREST, autenticação real, envio de convites e as verificações de integração acima continuam necessários no projeto da equipe. O seed usa as abreviações de componente BNCC `MA`, `LP`, `LI`, `HI`, `GE`, `CI`, alinhadas ao catálogo TypeScript.
