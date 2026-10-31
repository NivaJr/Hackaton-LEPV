# Pontos por atitude em aula

Responsável: Gallotte (Tarefa 04). Branch: `feat/gallotte-conteudo-ia`.

O professor abre `/professor/reconhecer` no celular, escolhe turma e matéria, marca um ou mais alunos, escolhe o motivo e confirma. Cada aluno marcado ganha 20 pontos de patente e recebe um aviso no sino. O responsável com vínculo confirmado também recebe o aviso e consegue ver a lista de elogios do filho.

## Regras

| Regra | Como está no código |
| --- | --- |
| Valor | 20 pontos, constante `RECOGNITION_POINTS` em `src/features/recognition/model.ts`. O cliente não envia pontos. |
| Destino | Só pontos anuais de patente. Não gera XP e não entra no ranking semanal. |
| Limite | 3 elogios por aluno por dia por professor. O dia é o calendário de `America/Sao_Paulo`, então zera à meia-noite de Brasília. |
| Motivos | `pergunta_curiosa`, `ajudou_turma`, `organizou_sala`, `colaboracao`, `superacao`, `outro`. Com `outro`, a nota é obrigatória. Nota tem até 140 caracteres. |
| Vários alunos | Um envio aceita até 40 alunos. Cada aluno vira um registro próprio com resultado próprio. |
| Quem dá | Professor com atribuição (`teacher_assignments`) na turma e na matéria escolhidas. |
| Quem recebe | Aluno com matrícula `active` na turma, na mesma escola. Os outros voltam como `sem_vinculo` e nada é gravado. |
| Idempotência | O cliente manda `idempotencyKey`. Repetir o envio com a mesma chave devolve o mesmo registro, sem pontos ou avisos novos. A mesma chave com outro motivo, nota, turma ou matéria dá 409. |
| Identidade | Professor, escola, turmas, vínculos e nome do professor vêm de `getSessionContext()`/`getOptionalSession()`. Do JSON só se aceitam `classId` e `subjectId`, que são conferidos contra a sessão. |
| IA | Nada desta feature passa pelo gateway de IA. Nome, nota e motivo não vão para fornecedor externo. |

## Arquivos

| Caminho | Papel |
| --- | --- |
| `src/features/recognition/model.ts` | Schemas Zod, constantes, motivos, fuso, visões públicas. |
| `src/features/recognition/ports.ts` | `RecognitionRepository`, `NotificationRepository` e `RosterReader`. |
| `src/features/recognition/service.ts` | Regras e autorização (`RecognitionService`). |
| `src/features/recognition/memory-repository.ts` | Adapter em memória para testes e demonstração local. |
| `src/features/recognition/server/supabase-repository.ts` | Adapter Supabase (tabelas e RPC propostas abaixo) e leitura de turma/matrícula/vínculo. |
| `src/features/recognition/server/runtime.ts` | Escolhe o adapter por `RECOGNITION_STORE`. |
| `src/features/recognition/http.ts` e `server/handler.ts` | Tratamento HTTP comum das rotas. |
| `src/app/api/recognition/**`, `src/app/api/notifications/**` | Rotas. |
| `src/app/(workspace)/professor/reconhecer/` | Página do professor, manifest e ícone. |
| `src/features/recognition/ui/` | Painel do professor, `NotificationBell`, `RecognitionToast`, cliente HTTP e CSS. |
| `tests/recognition-*.test.ts` | Testes sem rede e sem chave. |

## Configuração

| Variável | Uso |
| --- | --- |
| `RECOGNITION_STORE` | `supabase` (padrão) ou `memory`. Em `memory` os elogios ficam só no processo e somem ao reiniciar. O modo `memory` é recusado com `NODE_ENV=production`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Já usadas pela base. |
| `SUPABASE_SECRET_KEY` | Chave de servidor. A leitura de turma, matrícula e vínculo do responsável e a RPC de gravação rodam com ela, sempre depois de validar a sessão e sempre filtradas pela escola da sessão. |

Sem a chave de servidor, as rotas respondem 503 `NOT_CONFIGURED`. Com `RECOGNITION_STORE=supabase` e sem a migração abaixo aplicada, respondem 503 `STORE_UNAVAILABLE` com a mensagem "Os elogios ainda não estão disponíveis neste banco. Falta aplicar a migração de reconhecimentos (docs/RECONHECIMENTO.md)."

O cliente admin está duplicado em `server/runtime.ts` com o mesmo formato de `src/lib/supabase/admin.ts` da branch do Nivaldo. Depois do merge, trocar pela importação comum.

## Rotas

Todas exigem sessão (cookie). Respostas com `Cache-Control: private, no-store`. Erros sempre no formato `{ "error": { "code", "message" } }`. POST com `Origin` diferente do site dá 403 `INVALID_ORIGIN`. Campos extras no corpo ou na query dão 422 `INVALID_INPUT`.

| Status | Quando |
| --- | --- |
| 401 `UNAUTHENTICATED` | Sem sessão. |
| 403 `FORBIDDEN` | Papel errado, ou professor sem atribuição na turma/matéria. |
| 404 | `CLASS_NOT_FOUND`, `STUDENT_NOT_FOUND` (fora do escopo de quem pergunta), `NOTIFICATION_NOT_FOUND`. |
| 409 `IDEMPOTENCY_CONFLICT` | Chave reutilizada com outro conteúdo. |
| 422 `INVALID_INPUT` / `INVALID_JSON` | Corpo ou query inválidos. |
| 503 | `NOT_CONFIGURED`, `STORE_UNAVAILABLE`, `STORE_ERROR`. |

### POST `/api/recognition` (professor)

```json
{
  "classId": "uuid-da-turma",
  "subjectId": "matematica",
  "studentIds": ["uuid-aluno-1", "uuid-aluno-2"],
  "reason": "ajudou_turma",
  "note": "Explicou a lista para o colega",
  "idempotencyKey": "uuid-gerado-no-celular"
}
```

Resposta 200:

```json
{
  "classId": "uuid-da-turma",
  "subjectId": "matematica",
  "reason": "ajudou_turma",
  "day": "2026-10-31",
  "results": [
    { "studentId": "uuid-aluno-1", "status": "concedido", "recognitionId": "uuid", "points": 20, "repeated": false, "remainingToday": 2 },
    { "studentId": "uuid-aluno-2", "status": "limite_diario", "points": 0, "remainingToday": 0 },
    { "studentId": "uuid-x", "status": "sem_vinculo", "points": 0 }
  ]
}
```

`repeated: true` indica que o registro já existia com a mesma chave. O painel gera uma chave por tentativa e a mantém se a rede cair, então tocar de novo em "Tentar de novo" não duplica.

### GET `/api/recognition/students?classId=` (professor da turma)

```json
{
  "classId": "uuid", "className": "7º A", "day": "2026-10-31", "dailyLimit": 3, "points": 20,
  "students": [{ "studentId": "uuid", "name": "Ana Souza", "initials": "AS", "awardedToday": 1, "remainingToday": 2 }]
}
```

Só alunos com matrícula ativa. `awardedToday` conta apenas os elogios do professor logado.

### GET `/api/recognition?studentId=`

| Quem pergunta | O que vê |
| --- | --- |
| Aluno | Os próprios elogios. `studentId` pode ser omitido. Outro aluno dá 404. |
| Responsável | Elogios do filho com vínculo confirmado. Outro aluno dá 404. |
| Professor | Elogios dados nas turmas e matérias em que ele leciona (inclusive de outro professor da mesma matéria e turma), para aluno com matrícula ativa numa dessas turmas. Elogio de outra matéria não aparece. |
| Coordenador | Qualquer aluno da própria escola. |

```json
{
  "studentId": "uuid",
  "annualPoints": { "schoolYear": 2026, "points": 60 },
  "recognitions": [{
    "id": "uuid", "studentId": "uuid", "classId": "uuid", "subjectId": "matematica",
    "reason": "superacao", "reasonLabel": "Superação", "note": null, "points": 20,
    "teacherName": "Marta Ramos", "schoolYear": 2026, "createdAt": "2026-10-31T14:00:00.000Z"
  }]
}
```

`annualPoints` soma só os elogios do ano letivo da turma ativa. Vem `null` para professor e para aluno sem matrícula ativa. Lista os 100 mais recentes.

### GET `/api/notifications` (qualquer perfil logado)

```json
{
  "unreadCount": 1,
  "notifications": [{
    "id": "uuid", "kind": "recognition", "studentId": "uuid", "recognitionId": "uuid",
    "title": "Você ganhou 20 pontos de patente",
    "body": "Marta Ramos reconheceu em Matemática: Ajudou a turma.",
    "createdAt": "2026-10-31T14:00:00.000Z", "read": false
  }]
}
```

Não lidas primeiro, depois as mais novas. Até 50 itens. O responsável recebe título "Elogio para Ana" com o primeiro nome do filho.

### POST `/api/notifications/:id/read`

Corpo `{}`. Devolve `{ "notification": { ...read: true } }`. Notificação de outra pessoa dá 404.

## Para o Viegas (tela do aluno)

O sino está pronto em `src/features/recognition/ui/notification-bell.tsx`:

```tsx
import { NotificationBell } from "@/features/recognition/ui/notification-bell";

<NotificationBell />                {/* consulta a cada 60 s com a aba visível */}
<NotificationBell pollMs={0} />     {/* só carrega ao abrir a página */}
<NotificationBell toast={false} />  {/* sem aviso flutuante */}
```

Ele mostra contador, abre a lista, marca como lida ao tocar no item e exibe `RecognitionToast` quando chega aviso novo depois do primeiro carregamento. O toast também pode ser usado sozinho: `<RecognitionToast title body onClose />`. Os dois são client components e não recebem dados do aluno por props. Botões têm 44 px, o sino tem `aria-label` com a contagem e o toast usa `role="status"`. A página do aluno não foi alterada.

Para mostrar a lista completa de elogios no perfil do aluno, usar `GET /api/recognition` sem parâmetro.

## Para a Fabia (painel do responsável)

Usar `GET /api/recognition?studentId=<filho>` para a lista e `annualPoints`. O vínculo confirmado é conferido no servidor. O `NotificationBell` também funciona na página do responsável sem mudança, porque as notificações são do usuário logado.

## SQL proposto (para o Nivaldo aplicar)

A migração agora existe em `supabase/migrations/20261031060000_recognition.sql`, depois de `20261031050000_learning_classroom_name.sql`. Ela junta o SQL abaixo, a extensão do livro de pontos e a nova `learning_class_ranking` num arquivo só. Foi validada apenas em PGlite (`tests/recognition-database.test.ts`), com Auth emulado. Não foi aplicada no Supabase hospedado.

Diferenças do arquivo em relação ao SQL abaixo: a RPC recusa (`RECOGNITION_INVALID`) pontos diferentes de 20, limite fora de 1 a 3, `p_day` que não bate com o dia de São Paulo de `p_created_at` e ano letivo diferente do da turma; a busca de idempotência também filtra por escola; há `check (teacher_id <> student_id)`. O SQL abaixo fica como referência.

```sql
begin;

create table public.teacher_recognitions (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  teacher_id uuid not null,
  teacher_name text not null check (char_length(btrim(teacher_name)) between 1 and 200),
  classroom_id uuid not null,
  subject_id text not null references public.subjects(id),
  student_id uuid not null,
  reason text not null check (reason in ('pergunta_curiosa','ajudou_turma','organizou_sala','colaboracao','superacao','outro')),
  note text check (note is null or char_length(btrim(note)) between 1 and 140),
  points numeric(14,2) not null check (points > 0 and points <= 100),
  school_year smallint not null check (school_year between 2000 and 2200),
  award_day date not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  foreign key (teacher_id, school_id) references public.profiles(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  foreign key (classroom_id, school_id) references public.classrooms(id, school_id),
  check (reason <> 'outro' or note is not null),
  unique (teacher_id, idempotency_key, student_id),
  unique (id, student_id, school_id)
);
create index teacher_recognitions_daily_idx
  on public.teacher_recognitions (school_id, teacher_id, student_id, award_day);
create index teacher_recognitions_student_idx
  on public.teacher_recognitions (school_id, student_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  user_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind in ('recognition')),
  recognition_id uuid not null references public.teacher_recognitions(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (user_id, school_id) references public.profiles(id, school_id),
  foreign key (student_id, school_id) references public.profiles(id, school_id),
  unique (recognition_id, user_id)
);
create index notifications_inbox_idx
  on public.notifications (school_id, user_id, read_at nulls first, created_at desc);

alter table public.teacher_recognitions enable row level security;
alter table public.notifications enable row level security;

-- Aluno, responsável confirmado e coordenação leem tudo do aluno. Professor lê só a própria turma e matéria,
-- igual ao filtro de RecognitionService.listForStudent. Escrita só pela RPC.
create policy teacher_recognitions_read on public.teacher_recognitions for select to authenticated
using (
  school_id = app_private.current_school_id() and (
    (student_id = auth.uid() and app_private.has_role(school_id, 'aluno'))
    or app_private.is_guardian(student_id, school_id)
    or app_private.has_role(school_id, 'coordenador')
    or (app_private.has_role(school_id, 'professor') and exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.school_id = teacher_recognitions.school_id
        and ta.classroom_id = teacher_recognitions.classroom_id and ta.subject_id = teacher_recognitions.subject_id
    ))
  )
);
create policy notifications_own_read on public.notifications for select to authenticated
using (user_id = auth.uid() and school_id = app_private.current_school_id());
create policy notifications_own_mark_read on public.notifications for update to authenticated
using (user_id = auth.uid() and school_id = app_private.current_school_id())
with check (user_id = auth.uid() and school_id = app_private.current_school_id());

revoke all on public.teacher_recognitions, public.notifications from public, anon, authenticated;
grant select on public.teacher_recognitions, public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.teacher_recognitions, public.notifications to service_role;

-- Atômica por professor+aluno+dia: o lock impede que dois toques simultâneos passem do limite.
create function public.recognition_grant(
  p_id uuid, p_school uuid, p_teacher uuid, p_teacher_name text, p_class uuid, p_subject text,
  p_student uuid, p_reason text, p_note text, p_points numeric, p_school_year smallint, p_day date,
  p_key text, p_created_at timestamptz, p_limit integer, p_guardian_ids uuid[],
  p_student_title text, p_student_body text, p_guardian_title text, p_guardian_body text
) returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare existing public.teacher_recognitions%rowtype; created public.teacher_recognitions%rowtype; total integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_teacher::text || ':' || p_student::text || ':' || p_day::text, 0));
  select * into existing from public.teacher_recognitions
    where teacher_id = p_teacher and idempotency_key = p_key and student_id = p_student;
  if found then
    return jsonb_build_object('status', 'duplicate', 'recognition', to_jsonb(existing));
  end if;
  if not exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = p_teacher and ta.school_id = p_school
      and ta.classroom_id = p_class and ta.subject_id = p_subject
  ) then raise exception 'RECOGNITION_FORBIDDEN'; end if;
  perform 1 from public.enrollments e
    where e.student_id = p_student and e.school_id = p_school and e.classroom_id = p_class and e.status = 'active'
    for share;
  if not found then return jsonb_build_object('status', 'not_enrolled'); end if;
  select count(*) into total from public.teacher_recognitions
    where school_id = p_school and teacher_id = p_teacher and student_id = p_student and award_day = p_day;
  if total >= p_limit then return jsonb_build_object('status', 'limit'); end if;

  insert into public.teacher_recognitions(id, school_id, teacher_id, teacher_name, classroom_id, subject_id, student_id,
    reason, note, points, school_year, award_day, idempotency_key, created_at)
  values (p_id, p_school, p_teacher, p_teacher_name, p_class, p_subject, p_student,
    p_reason, p_note, p_points, p_school_year, p_day, p_key, p_created_at)
  returning * into created;

  insert into public.notifications(school_id, user_id, student_id, kind, recognition_id, title, body, created_at)
  values (p_school, p_student, p_student, 'recognition', created.id, p_student_title, p_student_body, p_created_at);
  insert into public.notifications(school_id, user_id, student_id, kind, recognition_id, title, body, created_at)
  select p_school, g.guardian_id, p_student, 'recognition', created.id, p_guardian_title, p_guardian_body, p_created_at
  from public.guardian_links g
  where g.school_id = p_school and g.student_id = p_student and g.status = 'confirmed'
    and g.guardian_id = any(p_guardian_ids);

  -- Só com a extensão do livro de pontos E a nova learning_class_ranking (próxima seção), na mesma migração.
  -- Sem a troca do ranking, este insert faz o elogio desempatar o TOP 10.
  insert into public.learning_point_ledger(id, school_id, student_id, attempt_id, classroom_id, root_question_id,
    subject_id, school_year, kind, points, keep_after_rotation, source, recognition_id)
  values (pg_catalog.gen_random_uuid(), p_school, p_student, null, p_class, null,
    p_subject, p_school_year, 'annual', p_points, true, 'recognition', created.id);

  return jsonb_build_object('status', 'created', 'recognition', to_jsonb(created));
end;
$$;

revoke all on function public.recognition_grant(uuid, uuid, uuid, text, uuid, text, uuid, text, text, numeric,
  smallint, date, text, timestamptz, integer, uuid[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.recognition_grant(uuid, uuid, uuid, text, uuid, text, uuid, text, text, numeric,
  smallint, date, text, timestamptz, integer, uuid[], text, text, text, text) to service_role;

comment on table public.teacher_recognitions is 'Elogio do professor por atitude em aula. Vale só pontos anuais de patente. Até 3 por aluno por dia por professor (dia de Brasília).';
comment on table public.notifications is 'Avisos por usuário. O usuário lê e marca read_at; criação só pela RPC.';

commit;
```

O adapter lê as colunas `id, school_id, teacher_id, teacher_name, classroom_id, subject_id, student_id, reason, note, points, school_year, award_day, idempotency_key, created_at` e espera da RPC `{ status: "created" | "duplicate", recognition: <linha> }`, `{ status: "limit" }` ou `{ status: "not_enrolled" }`. Se mudar nome de coluna, avisar para ajustar `server/supabase-repository.ts`.

## Extensão proposta do livro de pontos

Hoje `public.learning_point_ledger` (em `20261031030000_learning.sql` da `feat/nivaldo-core`) exige `attempt_id` e `root_question_id` e tem `unique (attempt_id, kind)`. Para os elogios somarem na patente sem criar tentativa falsa, os dois blocos abaixo entram juntos na mesma migração. Aplicar só o primeiro faz o elogio pesar no ranking.

```sql
alter table public.learning_point_ledger
  alter column attempt_id drop not null,
  alter column root_question_id drop not null,
  add column source text not null default 'attempt' check (source in ('attempt', 'recognition')),
  add column recognition_id uuid unique;

alter table public.learning_point_ledger
  add constraint learning_point_ledger_recognition_fk
    foreign key (recognition_id, student_id, school_id)
    references public.teacher_recognitions(id, student_id, school_id),
  add constraint learning_point_ledger_source_ref check (
    (source = 'attempt' and attempt_id is not null and root_question_id is not null and recognition_id is null)
    or (source = 'recognition' and kind = 'annual' and attempt_id is null and recognition_id is not null
        and keep_after_rotation)
  );

-- Obrigatório: o desempate do ranking usa só pontos de tentativa. Elogio fica fora do TOP 10.
create or replace function public.learning_class_ranking(p_school uuid, p_class uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(to_jsonb(ranked) order by ranked.xp desc,ranked."rankPoints" desc,ranked."studentId"),'[]'::jsonb)
  from (
    select p.id as "studentId",p.full_name as name,
      coalesce(sum(l.points) filter (where l.kind = 'xp' and l.source = 'attempt' and l.classroom_id = p_class
        and (l.keep_after_rotation or exists (
          select 1 from app_private.learning_catalogs c,jsonb_array_elements(c.payload->'activities') a
          where c.classroom_id = p_class and c.school_id = p_school and (a->>'active')::boolean and a->>'rootQuestionId' = l.root_question_id
        ))),0) as xp,
      coalesce(sum(l.points) filter (where l.kind = 'annual' and l.source = 'attempt' and l.school_year = cls.school_year),0) as "rankPoints"
    from public.profiles p
    join public.enrollments e on e.student_id = p.id and e.school_id = p.school_id and e.classroom_id = p_class and e.status = 'active'
    join public.classrooms cls on cls.id = e.classroom_id and cls.school_id = e.school_id
    left join public.learning_point_ledger l on l.student_id = p.id and l.school_id = p.school_id
    where p.school_id = p_school
    group by p.id,p.full_name
    order by xp desc,"rankPoints" desc,p.id limit 10
  ) ranked;
$$;
```

O corpo é o da `feat/nivaldo-core` com `l.source = 'attempt'` nos dois `filter`. `create or replace` mantém os `revoke`/`grant` da função. Se a função mudar na branch do Nivaldo antes da migração, refazer a troca sobre a versão nova.

Pontos que precisam de atenção no código do Nivaldo:

1. `unique (attempt_id, kind)` continua valendo para tentativas. Com `attempt_id` nulo o Postgres não compara as linhas, e a unicidade do elogio fica em `recognition_id unique`.
2. A FK composta `(attempt_id, student_id, school_id)` usa `MATCH SIMPLE`, então linhas com `attempt_id` nulo não são verificadas por ela.
3. A checagem final de `learning_commit_student` conta lançamentos por tentativa e não é afetada.
4. `learning_class_ranking` soma `kind = 'annual'` em `rankPoints`, que entra no desempate. Pela regra confirmada, elogio não entra no ranking. Por isso a troca da função acima é requisito da migração, não opcional.
5. `LearningService.summary` calcula `rankPoints` a partir do `ledger` do estado JSON, que não terá os elogios. Opções: somar `learning_point_ledger where source = 'recognition' and kind = 'annual' and school_year = ...`, ou chamar `RecognitionService.annualPoints(schoolId, studentId, schoolYear)`. A segunda já funciona no modo memória.

Se a extensão do livro ou a nova `learning_class_ranking` não forem aplicadas junto, remover o último `insert` da RPC. Os elogios continuam gravados e visíveis, mas a patente não os soma até a extensão entrar.

## Web manifest

A página declara `manifest: "/professor/reconhecer/manifest.webmanifest"` só para ela. O manifest e um ícone SVG são servidos por route handlers em `src/app/(workspace)/professor/reconhecer/`, sem mexer em `src/app/layout.tsx` nem em `public/`. Com isso o Android oferece "Adicionar à tela inicial" abrindo direto em `/professor/reconhecer`. Pendências fora desta área: ícones PNG 192 e 512 em `public/` para o iOS e para instalação completa no Android, e um link para `/professor/reconhecer` no painel do professor ou no menu do `AppShell` (arquivo global).

## O que foi testado

`tests/recognition-service.test.ts`, `tests/recognition-http.test.ts` e `tests/recognition-supabase.test.ts` cobrem: professor de outra turma e de outra escola, matéria não atribuída, aluno e responsável tentando premiar, aluno transferido e de outra turma, limite de 3 com troca de dia no fuso de Brasília, limite separado por professor, toque duplo com a mesma chave, chave reutilizada com outro motivo, só pontos anuais, aviso para aluno e responsável confirmado (não para pendente), leitura por aluno, colega, responsável, professor e coordenador, marcação de lida, formato de erro, 503 sem migração e o mapeamento do adapter Supabase com cliente falso.

`tests/recognition-database.test.ts` roda a migração em PGlite sobre a fundação e o aprendizado: elogio criado com crédito anual e aviso para aluno e responsável, quarto elogio do dia recusado, chave repetida devolvendo `duplicate`, ranking sem pontos de elogio e RLS de notificações e elogios.

Não foi testado: Supabase hospedado e PostgREST, navegador real e instalação do manifest.
